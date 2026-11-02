import Dexie, { type Table } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { z } from "zod";
import {
  checkInSchema,
  historySchema,
  type HistoricalRecord,
  type SetupDraft,
  decisionSchema,
  emptyData,
  exerciseSchema,
  identity,
  overrideSchema,
  painSchema,
  planSchema,
  profileSchema,
  sessionSchema,
  setSchema,
  tournamentSchema,
  templateSchema,
  recurrenceSchema,
  recurrenceExceptionSchema,
  type TrainingTemplate,
  type RecurringSchedule,
  type RecurrenceException,
  type CheckIn,
  type Data,
  type Dataset,
  type Decision,
  type Exercise,
  type Override,
  type Pain,
  type Plan,
  type Profile,
  type Session,
  type StrengthSet,
  type Tournament,
} from "./domain/models";
import { PLANNER_VERSION, type Suggestion } from "./domain/planner";
class AthleteDatabase extends Dexie {
  templates!: Table<TrainingTemplate, string>;
  recurrences!: Table<RecurringSchedule, string>;
  recurrenceExceptions!: Table<RecurrenceException, string>;
  profiles!: Table<Profile, string>;
  history!: Table<HistoricalRecord, string>;
  setup!: Table<SetupDraft, string>;
  tournaments!: Table<Tournament, string>;
  plans!: Table<Plan, string>;
  sessions!: Table<Session, string>;
  checkIns!: Table<CheckIn, string>;
  pain!: Table<Pain, string>;
  exercises!: Table<Exercise, string>;
  sets!: Table<StrengthSet, string>;
  decisions!: Table<Decision, string>;
  overrides!: Table<Override, string>;
  constructor(name = "athleteos") {
    super(name);
    this.version(1).stores({
      profiles: "id",
      tournaments: "id,dataset,startDate",
      plans: "id,dataset,date",
      sessions: "id,dataset,date,plannedSessionId",
      checkIns: "id,dataset,&[dataset+date]",
      pain: "id,dataset,date",
      exercises: "id,dataset,sessionId",
      sets: "id,dataset,exerciseId",
      decisions: "id,dataset,key",
      overrides: "id,dataset,until",
    });
    this.version(2).stores({
      history: "id,dataset,date,batchId,sourceKey",
      setup: "id,dataset",
    });
    this.version(3).stores({
      templates: "id,dataset",
      recurrences: "id,dataset,active",
      recurrenceExceptions: "id,dataset,seriesId,[seriesId+date]",
      plans: "id,dataset,date,seriesId",
    });
    // Optional routine durations and custom activity labels broaden existing records.
    // Known values and completed training are preserved without a data rewrite.
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        const profiles = (await tx.table("profiles").toArray()) as Profile[];
        for (const p of profiles)
          if (p.weeklyRules) {
            const id = `${p.id}:usual-week`;
            if (!(await tx.table("templates").get(id)))
              await tx.table("templates").put({
                ...identity(p.id as Dataset, id),
                name: "My Usual Training Week",
                rules: p.weeklyRules,
                restDays: p.restDays ?? [],
                unavailableDays: p.unavailableWeekdays ?? [],
                source: "typical",
                sourceSessionIds: [],
              });
          }
      });
  }
}
export const db = new AthleteDatabase();
export const tables = [
  "templates",
  "recurrences",
  "recurrenceExceptions",
  "history",
  "tournaments",
  "plans",
  "sessions",
  "checkIns",
  "pain",
  "exercises",
  "sets",
  "decisions",
  "overrides",
] as const;
export async function readData(dataset: Dataset, database = db): Promise<Data> {
  const values = await Promise.all(
    tables.map((t) =>
      database.table(t).where("dataset").equals(dataset).toArray(),
    ),
  );
  return {
    profile: await database.profiles.get(dataset),
    ...Object.fromEntries(tables.map((t, i) => [t, values[i]])),
  } as Data;
}
export function useData(dataset: Dataset) {
  return useLiveQuery(() => readData(dataset), [dataset]);
}
export const backupSchema = z.object({
  app: z.literal("AthleteOS"),
  schemaVersion: z.literal(4),
  templates: z.array(templateSchema),
  recurrences: z.array(recurrenceSchema),
  recurrenceExceptions: z.array(recurrenceExceptionSchema),
  history: z.array(historySchema),
  exportedAt: z.string(),
  profile: profileSchema.optional(),
  tournaments: z.array(tournamentSchema),
  plans: z.array(planSchema),
  sessions: z.array(sessionSchema),
  checkIns: z.array(checkInSchema),
  pain: z.array(painSchema),
  exercises: z.array(exerciseSchema),
  sets: z.array(setSchema),
  decisions: z.array(decisionSchema),
  overrides: z.array(overrideSchema),
});
export function serialize(data: Data) {
  return JSON.stringify(
    {
      app: "AthleteOS",
      schemaVersion: 4,
      exportedAt: new Date().toISOString(),
      ...data,
    },
    null,
    2,
  );
}
export function parseBackup(text: string): Data {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Select an AthleteOS backup.");
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 1
  )
    value = { ...value, schemaVersion: 2, history: [] };
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 2
  )
    value = {
      ...value,
      schemaVersion: 3,
      templates: [],
      recurrences: [],
      recurrenceExceptions: [],
    };
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 3
  )
    value = { ...value, schemaVersion: 4 };
  const result = backupSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Invalid or incompatible backup. AthleteOS backup schema 4 (or legacy schema 1/2/3) is required. " +
        result.error.issues
          .slice(0, 2)
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
    );
  const data = result.data;
  const allIds = new Set<string>();
  for (const t of tables) {
    for (const row of data[t]) {
      if (allIds.has(row.id))
        throw new Error(
          "Duplicate record identifiers in backup. No data was changed.",
        );
      allIds.add(row.id);
    }
  }
  const dates = new Set<string>();
  for (const c of data.checkIns) {
    if (dates.has(c.date))
      throw new Error("Duplicate daily check-ins in backup.");
    dates.add(c.date);
  }
  const completedPlans = new Set<string>();
  for (const e of data.recurrenceExceptions)
    if (!data.recurrences.some((r) => r.id === e.seriesId))
      throw new Error("Missing recurring schedule for an exception.");
  for (const p of data.plans)
    if (p.seriesId && !data.recurrences.some((r) => r.id === p.seriesId))
      throw new Error("Missing recurring schedule for a plan.");
  for (const s of data.sessions) {
    if (s.plannedSessionId) {
      if (
        !data.plans.some(
          (p) => p.id === s.plannedSessionId && p.status === "completed",
        )
      )
        throw new Error("A completed session has an invalid plan association.");
      if (completedPlans.has(s.plannedSessionId))
        throw new Error("A planned session is completed more than once.");
      completedPlans.add(s.plannedSessionId);
    }
    if (
      s.tournamentId &&
      !data.tournaments.some((t) => t.id === s.tournamentId)
    )
      throw new Error("Missing tournament association.");
  }
  for (const e of data.exercises)
    if (!data.sessions.some((s) => s.id === e.sessionId))
      throw new Error("Missing session for a strength exercise.");
  for (const s of data.sets)
    if (!data.exercises.some((e) => e.id === s.exerciseId))
      throw new Error("Missing exercise for a strength set.");
  for (const p of data.plans)
    if (
      p.tournamentId &&
      !data.tournaments.some((t) => t.id === p.tournamentId)
    )
      throw new Error("Missing tournament for a plan.");
  for (const h of data.history) {
    if (
      h.completedSessionId &&
      !data.sessions.some(
        (s) =>
          s.id === h.completedSessionId && s.provenance?.historyId === h.id,
      )
    )
      throw new Error(
        "Historical completion has an invalid session association.",
      );
    if (
      h.tournamentId &&
      !data.tournaments.some((t) => t.id === h.tournamentId)
    )
      throw new Error(
        "Historical event has an invalid tournament association.",
      );
  }
  return data;
}
export async function replaceData(data: Data, dataset: Dataset, database = db) {
  // Validate before touching existing storage, then remap IDs for isolation.
  const valid = parseBackup(serialize(data));
  const mapping = new Map<string, string>();
  tables.forEach((t) =>
    valid[t].forEach((row) =>
      mapping.set(
        row.id,
        `${dataset}:${row.id.replace(/^(sample:|personal:)+/, "")}`,
      ),
    ),
  );
  const remap = (id: string | undefined) =>
    id ? (mapping.get(id) ?? id) : undefined;
  await database.transaction("rw", database.tables, async () => {
    for (const t of tables)
      await database.table(t).where("dataset").equals(dataset).delete();
    await database.profiles.delete(dataset);
    await database.setup.delete(dataset);
    if (valid.profile)
      await database.profiles.put({ ...valid.profile, id: dataset });
    for (const t of tables) {
      const rows = valid[t].map((row) => {
        const r = {
          ...row,
          id: mapping.get(row.id)!,
          dataset,
        } as unknown as Record<string, unknown>;
        for (const k of [
          "completedSessionId",
          "plannedSessionId",
          "tournamentId",
          "sessionId",
          "exerciseId",
          "seriesId",
          "templateId",
          "planId",
        ])
          if (typeof r[k] === "string") r[k] = remap(r[k] as string);
        if (t === "templates")
          r.sourceSessionIds = (r.sourceSessionIds as string[]).map((id) =>
            remap(id)!,
          );
        if (r.provenance && typeof r.provenance === "object") {
          const provenance = r.provenance as { historyId?: string };
          provenance.historyId = remap(provenance.historyId);
        }
        if (t === "decisions") {
          const d = r as unknown as Decision;
          d.inputIds = d.inputIds.map((id) => remap(id)!);
          for (const key of ["original", "applied"] as const)
            if (d[key])
              d[key] = {
                ...d[key]!,
                id: remap(d[key]!.id)!,
                dataset,
                tournamentId: remap(d[key]!.tournamentId),
                seriesId: remap(d[key]!.seriesId),
              };
        }
        return r;
      });
      if (rows.length) await database.table(t).bulkPut(rows);
    }
  });
}
export async function clearSample() {
  await db.transaction("rw", db.tables, async () => {
    for (const t of tables)
      await db.table(t).where("dataset").equals("sample").delete();
    await db.profiles.delete("sample");
    await db.setup.delete("sample");
  });
}
export async function saveSession(
  session: Session,
  exercises: Exercise[] = [],
  sets: StrengthSet[] = [],
) {
  sessionSchema.parse(session);
  exercises.forEach((e) => exerciseSchema.parse(e));
  sets.forEach((s) => setSchema.parse(s));
  await db.transaction(
    "rw",
    [db.sessions, db.plans, db.exercises, db.sets],
    async () => {
      if (session.plannedSessionId) {
        const p = await db.plans.get(session.plannedSessionId);
        if (!p || p.dataset !== session.dataset)
          throw new Error("The linked plan no longer exists.");
        const other = await db.sessions
          .where("plannedSessionId")
          .equals(p.id)
          .first();
        if (other && other.id !== session.id)
          throw new Error("This plan has already been completed.");
        await db.plans.update(p.id, {
          status: "completed",
          updatedAt: session.updatedAt,
        });
      }
      const old = await db.exercises
        .where("sessionId")
        .equals(session.id)
        .toArray();
      for (const e of old)
        await db.sets.where("exerciseId").equals(e.id).delete();
      await db.exercises.where("sessionId").equals(session.id).delete();
      await db.sessions.put(session);
      if (exercises.length) await db.exercises.bulkPut(exercises);
      if (sets.length) await db.sets.bulkPut(sets);
    },
  );
}
export async function deleteSession(session: Session) {
  await db.transaction(
    "rw",
    [db.sessions, db.plans, db.exercises, db.sets, db.history],
    async () => {
      await db.sessions.delete(session.id);
      if (session.provenance?.historyId)
        await db.history.update(session.provenance.historyId, {
          status: "unconfirmed",
          completedSessionId: undefined,
          updatedAt: new Date().toISOString(),
        });
      if (session.plannedSessionId)
        await db.plans.update(session.plannedSessionId, { status: "planned" });
      const es = await db.exercises
        .where("sessionId")
        .equals(session.id)
        .toArray();
      for (const e of es)
        await db.sets.where("exerciseId").equals(e.id).delete();
      await db.exercises.where("sessionId").equals(session.id).delete();
    },
  );
}
export async function deleteTournament(id: string) {
  await db.transaction(
    "rw",
    [db.tournaments, db.sessions, db.plans, db.history],
    async () => {
      await db.tournaments.delete(id);
      const history = await db.history
        .filter((h) => h.tournamentId === id)
        .toArray();
      for (const h of history)
        await db.history.update(h.id, {
          status: "unconfirmed",
          tournamentId: undefined,
          updatedAt: new Date().toISOString(),
        });
      for (const table of [db.sessions, db.plans]) {
        const rows = await table.toArray();
        for (const r of rows.filter((s) => s.tournamentId === id))
          await table.update(r.id, { tournamentId: undefined });
      }
    },
  );
}
export async function applySuggestion(
  s: Suggestion,
  dataset: Dataset,
  date: string,
) {
  await db.transaction(
    "rw",
    [db.plans, db.decisions, db.recurrenceExceptions],
    async () => {
      if (!s.planId)
        throw new Error("This observation has no automatic adjustment.");
      const original = await db.plans.get(s.planId);
      if (
        !original ||
        original.locked ||
        original.status !== "planned" ||
        original.date < date ||
        original.dataset !== dataset
      )
        throw new Error("This session is no longer available for adjustment.");
      if (
        await db.decisions
          .where("key")
          .equals(s.key)
          .filter((d) => d.dataset === dataset && d.status === "applied")
          .count()
      )
        throw new Error("This suggestion was already applied.");
      const applied = {
        ...original,
        occurrenceEdited: original.seriesId ? true : original.occurrenceEdited,
        duration: s.newDuration ?? original.duration,
        date: s.newDate ?? original.date,
        updatedAt: new Date().toISOString(),
      };
      await db.plans.put(applied);
      if (original.seriesId)
        await db.recurrenceExceptions.put({
          ...identity(dataset, `edited:${original.id}`),
          seriesId: original.seriesId,
          ruleId: original.templateRuleId!,
          date: original.occurrenceDate ?? original.date,
          action: "edited",
          planId: original.id,
        });
      await db.decisions.put({
        ...identity(dataset),
        key: s.key,
        status: "applied",
        algorithm: PLANNER_VERSION,
        rationale: s.text,
        inputIds: s.inputIds,
        original,
        applied,
      });
    },
  );
}
export async function undoDecision(d: Decision) {
  await db.transaction(
    "rw",
    [db.plans, db.decisions, db.recurrenceExceptions],
    async () => {
      if (!d.original || !d.applied) throw new Error("Nothing to undo.");
      const current = await db.plans.get(d.original.id);
      if (
        !current ||
        current.updatedAt !== d.applied.updatedAt ||
        current.status !== "planned"
      )
        throw new Error(
          "This session was changed after the adjustment. Edit it manually to preserve your newer changes.",
        );
      await db.plans.put({
        ...d.original,
        updatedAt: new Date().toISOString(),
      });
      if (d.original.seriesId && !d.original.occurrenceEdited)
        await db.recurrenceExceptions
          .where("seriesId")
          .equals(d.original.seriesId)
          .filter((e) => e.planId === d.original!.id && e.action === "edited")
          .delete();
      await db.decisions.update(d.id, {
        status: "undone",
        updatedAt: new Date().toISOString(),
      });
    },
  );
}
export function download(
  filename: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v: unknown) => {
    let s = v === undefined || v === null ? "" : String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    keys.map(cell).join(","),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
  ].join("\r\n");
}
export { AthleteDatabase };
export const blankData = emptyData;
