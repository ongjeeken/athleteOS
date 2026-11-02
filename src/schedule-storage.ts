import { db, readData } from "./db";
import { addDays, weekStart } from "./domain/dates";
import {
  generateOccurrences,
  previewOccurrences,
  type PlanPreview,
} from "./domain/schedule";
import {
  identity,
  planSchema,
  recurrenceSchema,
  templateSchema,
  type Dataset,
  type Plan,
  type RecurringSchedule,
  type TrainingTemplate,
} from "./domain/models";
export async function saveTemplate(template: TrainingTemplate) {
  const valid = templateSchema.parse(template);
  await db.templates.put({ ...valid, updatedAt: new Date().toISOString() });
}
export async function saveSchedule(
  rows: PlanPreview[],
  series?: RecurringSchedule,
) {
  if (!rows.some((r) => r.included))
    throw new Error("Select at least one new session in the preview.");
  const dataset = rows[0].plan.dataset;
  return db.transaction(
    "rw",
    [
      db.plans,
      db.sessions,
      db.profiles,
      db.tournaments,
      db.recurrences,
      db.recurrenceExceptions,
      db.templates,
      db.history,
      db.checkIns,
      db.pain,
      db.exercises,
      db.sets,
      db.decisions,
      db.overrides,
    ],
    async () => {
      const data = await readData(dataset);
      if (rows.some((r) => r.plan.dataset !== dataset))
        throw new Error("Schedules must belong to one athlete dataset.");
      const checked = previewOccurrences(
        rows.map((r) => planSchema.parse(r.plan)),
        data,
      ).filter(
        (r) =>
          !r.duplicateOf &&
          rows.some(
            (original) => original.plan.id === r.plan.id && original.included,
          ),
      );
      if (checked.some((r) => r.plan.dataset !== dataset))
        throw new Error("Schedules must belong to one athlete dataset.");
      if (series) {
        const valid = recurrenceSchema.parse(series);
        if (
          valid.dataset !== dataset ||
          checked.some((r) => r.plan.seriesId !== valid.id)
        )
          throw new Error("Recurring schedule association does not match.");
        await db.recurrences.add(valid);
        for (const row of rows.filter((r) => !r.included)) {
          await db.recurrenceExceptions.put({
            ...identity(dataset),
            seriesId: valid.id,
            ruleId: row.plan.templateRuleId!,
            date: row.plan.occurrenceDate ?? row.plan.date,
            action: "skipped",
          });
        }
      }
      if (checked.length) await db.plans.bulkAdd(checked.map((r) => r.plan));
      for (const { plan: p } of checked.filter(
        (r) => r.plan.seriesId && r.plan.occurrenceEdited,
      ))
        await db.recurrenceExceptions.put({
          ...identity(dataset),
          seriesId: p.seriesId!,
          ruleId: p.templateRuleId!,
          date: p.occurrenceDate ?? p.date,
          action: "edited",
          planId: p.id,
        });
      return {
        saved: checked.length,
        duplicates: rows.filter((r) => r.included).length - checked.length,
        batchId: checked[0]?.plan.planningBatchId,
      };
    },
  );
}
export async function undoSchedule(batchId: string, dataset: Dataset) {
  await db.transaction("rw", [db.plans, db.recurrences], async () => {
    const plans = await db.plans
      .where("dataset")
      .equals(dataset)
      .filter(
        (p) =>
          p.planningBatchId === batchId &&
          p.status === "planned" &&
          !p.locked &&
          !p.occurrenceEdited,
      )
      .toArray();
    const seriesIds = new Set(plans.map((p) => p.seriesId).filter(Boolean));
    await db.plans.bulkDelete(plans.map((p) => p.id));
    for (const id of seriesIds)
      await db.recurrences.update(id!, {
        active: false,
        updatedAt: new Date().toISOString(),
      });
  });
}
export async function editOccurrence(plan: Plan) {
  await db.transaction("rw", [db.plans, db.recurrenceExceptions], async () => {
    const existing = await db.plans.get(plan.id);
    if (existing?.status === "completed")
      throw new Error(
        "Completed training is protected. Edit its actual session in the journal.",
      );
    const value = planSchema.parse({
      ...plan,
      occurrenceEdited: !!plan.seriesId,
      updatedAt: new Date().toISOString(),
    });
    await db.plans.put(value);
    if (value.seriesId)
      await db.recurrenceExceptions.put({
        ...identity(value.dataset, `edited:${value.id}`),
        seriesId: value.seriesId,
        ruleId: value.templateRuleId!,
        date: value.occurrenceDate ?? existing?.date ?? value.date,
        action: "edited",
        planId: value.id,
      });
  });
}
export async function skipOccurrence(plan: Plan) {
  await db.transaction("rw", [db.plans, db.recurrenceExceptions], async () => {
    const existing = await db.plans.get(plan.id);
    if (!existing || existing.status === "completed" || existing.locked)
      throw new Error("Completed or locked training is protected.");
    if (existing.seriesId)
      await db.recurrenceExceptions.put({
        ...identity(existing.dataset, `skip:${existing.id}`),
        seriesId: existing.seriesId,
        ruleId: existing.templateRuleId!,
        date: existing.occurrenceDate ?? existing.date,
        action: "skipped",
      });
    await db.plans.delete(existing.id);
  });
}
export type SeriesScope = "future" | "entire";
export async function updateSeries(
  series: RecurringSchedule,
  from: string,
  scope: SeriesScope,
  today: string,
  reviewed?: PlanPreview[],
) {
  const valid = recurrenceSchema.parse(series);
  await db.transaction("rw", db.tables, async () => {
    const stored = await db.recurrences.get(valid.id);
    if (!stored || stored.dataset !== valid.dataset)
      throw new Error("The recurring schedule no longer exists.");
    const data = await readData(valid.dataset);
    const cutoff = scope === "entire" ? today : from < today ? today : from;
    const rollingEnd = addDays(today, 83);
    const through =
      valid.endDate ??
      (valid.generatedThrough > rollingEnd
        ? valid.generatedThrough
        : rollingEnd);
    const protectedRows = data.plans.filter(
      (p) =>
        p.seriesId === valid.id &&
        (p.status === "completed" || p.locked || p.occurrenceEdited),
    );
    const protectedKeys = new Set(
      protectedRows.map(
        (p) => `${p.templateRuleId}|${p.occurrenceDate ?? p.date}`,
      ),
    );
    data.recurrenceExceptions
      .filter((e) => e.seriesId === valid.id)
      .forEach((e) => protectedKeys.add(`${e.ruleId}|${e.date}`));
    const removed = data.plans.filter(
      (p) =>
        p.seriesId === valid.id &&
        p.date >= cutoff &&
        p.status === "planned" &&
        !p.locked &&
        !p.occurrenceEdited,
    );
    await db.plans.bulkDelete(removed.map((p) => p.id));
    const retained = {
      ...data,
      plans: data.plans.filter((p) => !removed.some((r) => r.id === p.id)),
    };
    const start = cutoff > valid.startDate ? cutoff : valid.startDate;
    const proposed =
      start <= through && valid.active
        ? generateOccurrences({
            dataset: valid.dataset,
            rules: valid.rules,
            restDays: valid.restDays,
            unavailableDays: valid.unavailableDays,
            start,
            end: through,
            seriesId: valid.id,
          }).filter((p) => !protectedKeys.has(`${p.templateRuleId}|${p.date}`))
        : [];
    const reviewedPlans = proposed.flatMap((p) => {
      if (!reviewed) return [p];
      const match = reviewed.find(
        (r) =>
          r.plan.templateRuleId === p.templateRuleId &&
          (r.plan.occurrenceDate ?? r.plan.date) === p.date,
      );
      return match?.included
        ? [
            {
              ...p,
              duration: match.plan.duration,
              date: match.plan.date,
              occurrenceEdited:
                match.plan.duration !== p.duration ||
                match.plan.date !== p.date,
            },
          ]
        : [];
    });
    if (reviewed)
      for (const row of reviewed.filter((r) => !r.included)) {
        await db.recurrenceExceptions.put({
          ...identity(valid.dataset),
          seriesId: valid.id,
          ruleId: row.plan.templateRuleId!,
          date: row.plan.occurrenceDate ?? row.plan.date,
          action: "skipped",
        });
      }
    const additions = previewOccurrences(reviewedPlans, retained)
      .filter((r) => !r.duplicateOf)
      .map((r) => r.plan);
    if (additions.length) await db.plans.bulkAdd(additions);
    await db.recurrences.put({
      ...valid,
      generatedThrough: through,
      updatedAt: new Date().toISOString(),
    });
  });
}
export async function endSeries(id: string, end: string, today: string) {
  const series = await db.recurrences.get(id);
  if (!series) return;
  await updateSeries(
    {
      ...series,
      active: false,
      endDate: end < series.startDate ? series.startDate : end,
    },
    end < series.startDate ? series.startDate : addDays(end, 1),
    "future",
    today,
  );
}
export async function extendRecurringSchedules(
  dataset: Dataset,
  today: string,
) {
  // Indefinite definitions are expanded locally through a rolling twelve-week horizon.
  // No planned occurrence is interpreted as a completed workout.
  const series = await db.recurrences
    .where("dataset")
    .equals(dataset)
    .filter(
      (s) =>
        s.active &&
        s.endDate === null &&
        s.generatedThrough < addDays(today, 83),
    )
    .toArray();
  for (const s of series)
    await updateSeries(s, addDays(s.generatedThrough, 1), "future", today);
}

export async function editTrainingWeek(
  original: Plan,
  changed: Plan,
  today: string,
) {
  const start = weekStart(original.date),
    end = addDays(start, 6);
  await db.transaction("rw", [db.plans, db.recurrenceExceptions], async () => {
    const matching = await db.plans
      .where("dataset")
      .equals(original.dataset)
      .filter(
        (p) =>
          p.status === "planned" &&
          (p.id === original.id || !p.locked) &&
          (p.id === original.id || !p.occurrenceEdited) &&
          p.date >= start &&
          p.date <= end &&
          (p.id === original.id || p.date >= today) &&
          p.seriesId === original.seriesId &&
          p.category === original.category &&
          (p.customActivity ?? "") === (original.customActivity ?? "") &&
          p.title === original.title &&
          (p.timeOfDay ?? "Any time") === (original.timeOfDay ?? "Any time"),
      )
      .toArray();
    for (const p of matching)
      await editOccurrence({
        ...p,
        title: changed.title,
        category: changed.category,
        customActivity: changed.customActivity,
        duration: changed.duration,
        time: changed.time,
        timeOfDay: changed.timeOfDay,
        subtype: changed.subtype,
        notes: changed.notes,
        locked: p.id === original.id ? changed.locked : p.locked,
        date: p.id === original.id ? changed.date : p.date,
      });
  });
}
