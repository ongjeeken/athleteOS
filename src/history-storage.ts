import { db } from "./db";
import { addDays } from "./domain/dates";
import {
  detectDuplicates,
  provenance,
  validateReview,
  type Candidate,
} from "./domain/history";
import {
  identity,
  sessionSchema,
  historySchema,
  tournamentSchema,
  type WeeklyRule,
  type Data,
  type Dataset,
  type SetupDraft,
} from "./domain/models";
import { futureFromWeek, setupProfile } from "./domain/setup";
export async function saveUsualWeek(
  dataset: Dataset,
  rules: WeeklyRule[],
  restDays: number[],
  unavailableDays: number[],
) {
  const existing = await db.profiles.get(dataset);
  if (!existing) throw new Error("Complete the initial setup first.");
  const profile = setupProfile(
    {
      id: dataset,
      dataset,
      step: 2,
      name: existing.name,
      timezone: existing.timezone,
      tournaments: [],
      rules,
      restDays,
      unavailableDays,
      primaryGoal: existing.primaryGoal ?? "Balanced athletic development",
      secondaryGoals: existing.secondaryGoals ?? [],
      contextNotes: existing.contextNotes ?? "",
      updatedAt: new Date().toISOString(),
    },
    existing,
  );
  await db.transaction("rw", [db.profiles, db.templates], async () => {
    await db.profiles.put({
      ...existing,
      weeklyRules: profile.weeklyRules,
      restDays: profile.restDays,
      unavailableWeekdays: profile.unavailableWeekdays,
      preferredDays: profile.preferredDays,
      frequency: profile.frequency,
    });
    await db.templates.put({
      ...identity(dataset, `${dataset}:usual-week`),
      name: "My Usual Training Week",
      rules,
      restDays,
      unavailableDays,
      source: "typical",
      sourceSessionIds: [],
    });
  });
}
export async function saveSetup(
  draft: SetupDraft,
  date: string,
  templateOnly = false,
) {
  if (templateOnly)
    return saveUsualWeek(
      draft.dataset,
      draft.rules,
      draft.restDays,
      draft.unavailableDays,
    );
  const existing = await db.profiles.get(draft.dataset),
    profile = setupProfile(draft, existing);
  const plans = futureFromWeek(
    draft.rules,
    draft.restDays,
    draft.unavailableDays,
    date,
    draft.dataset,
  );
  await db.transaction(
    "rw",
    [db.profiles, db.setup, db.plans, db.tournaments, db.templates],
    async () => {
      const retained = await db.plans
        .where("dataset")
        .equals(draft.dataset)
        .toArray();
      const additions = plans.filter(
        (next) =>
          !retained.some(
            (p) =>
              p.date === next.date &&
              ((next.templateRuleId &&
                p.templateRuleId === next.templateRuleId) ||
                (p.title === next.title &&
                  p.category === next.category &&
                  p.time === next.time)),
          ),
      );
      if (additions.length) await db.plans.bulkPut(additions);
      if (draft.tournaments.length)
        await db.tournaments.bulkPut(
          draft.tournaments.map((t) => tournamentSchema.parse(t)),
        );
      await db.profiles.put(profile);
      await db.templates.put({
        ...identity(draft.dataset, `${draft.dataset}:usual-week`),
        name: "My Usual Training Week",
        rules: draft.rules,
        restDays: draft.restDays,
        unavailableDays: draft.unavailableDays,
        source: "typical",
        sourceSessionIds: [],
      });
      await db.setup.delete(draft.dataset);
    },
  );
}
export async function saveReviewedHistory(
  rows: Candidate[],
  dataset: Dataset,
  date: string,
) {
  validateReview(rows, date);
  return db.transaction(
    "rw",
    [db.history, db.sessions, db.tournaments, db.profiles],
    async () => {
      // Re-check after review and within the write transaction; stale previews cannot double-import.
      const existing: Pick<Data, "sessions" | "tournaments" | "history"> = {
        sessions: await db.sessions.where("dataset").equals(dataset).toArray(),
        tournaments: await db.tournaments
          .where("dataset")
          .equals(dataset)
          .toArray(),
        history: await db.history.where("dataset").equals(dataset).toArray(),
      };
      const checked = detectDuplicates(rows, existing).filter((r) =>
        rows.some((original) => original.id === r.id && original.included),
      );
      let saved = 0,
        completed = 0,
        duplicates = 0;
      for (const candidate of checked) {
        if (candidate.dataset !== dataset)
          throw new Error("History belongs to another athlete dataset.");
        if (candidate.duplicateOf) {
          duplicates++;
          continue;
        }
        const prior = existing.history.find((h) => h.id === candidate.id);
        if (prior?.status === "completed")
          throw new Error(
            "A historical session has already been confirmed. Edit it in the training journal.",
          );
        const record = historySchema.parse({
          ...candidate,
          sourceTimezone:
            candidate.sourceTimezone ||
            ((await db.profiles.get(dataset))?.timezone ?? "Asia/Singapore"),
          updatedAt: new Date().toISOString(),
        });
        if (record.status === "completed" && record.kind === "session") {
          const id = crypto.randomUUID();
          const session = sessionSchema.parse({
            ...identity(dataset, id),
            date: record.date,
            time: record.time,
            timeOfDay: record.timeOfDay,
            title: record.title,
            category: record.category,
            customActivity: record.customActivity,
            durationMinutes: record.durationMinutes!,
            rpe: record.rpe,
            rpeInputMode: record.rpeInputMode ?? "quick",
            sessionLoad:
              record.rpe === null ? null : record.durationMinutes! * record.rpe,
            notes: record.notes,
            subtype: "",
            modality: "",
            results: "",
            provenance: provenance(record),
          });
          await db.sessions.put(session);
          record.completedSessionId = id;
          completed++;
        } else if (
          record.status === "completed" &&
          record.kind === "tournament"
        ) {
          const tournament = tournamentSchema.parse({
            ...identity(dataset),
            name: record.title,
            startDate: record.date,
            endDate: record.endDate,
            priority: record.priority,
            location: "",
            notes: record.notes,
            goal: "",
            results: "",
            provenance: provenance(record),
          });
          await db.tournaments.put(tournament);
          record.tournamentId = tournament.id;
        }
        await db.history.put(record);
        saved++;
      }
      const p = await db.profiles.get(dataset);
      if (p)
        await db.profiles.update(dataset, { quickStartStatus: "completed" });
      return { saved, completed, duplicates };
    },
  );
}
export async function skipHistory(dataset: Dataset) {
  await db.profiles.update(dataset, { quickStartStatus: "skipped" });
}
export function candidateFromStored(
  record: Data["history"][number],
): Candidate {
  return { ...record, included: true, warnings: [] };
}
export function exceptionalRecord(dataset: Dataset, date: string): Candidate {
  return {
    ...identity(dataset),
    batchId: crypto.randomUUID(),
    source: "manual",
    sourceName: "Added during historical review",
    sourceKey: "manual:" + crypto.randomUUID(),
    sourceTimezone: "",
    date,
    endDate: date,
    time: "",
    title: "Exceptional session",
    category: "Fencing",
    kind: "session",
    priority: "C",
    durationMinutes: null,
    rpe: null,
    estimatedFields: ["time"],
    status: "unconfirmed",
    notes: "",
    included: true,
    warnings: [],
  };
}
export const maxImportEnd = (date: string) => addDays(date, -1);
