import {
  csvCandidates,
  parseCsvTable,
  defaultImportOptions,
} from "../src/domain/import-history";
import { beforeEach, expect, it } from "vitest";
import Dexie from "dexie";
import {
  db,
  readData,
  AthleteDatabase,
  parseBackup,
  serialize,
} from "../src/db";
import { saveSetup, saveUsualWeek } from "../src/history-storage";
import { initialSetup, futureFromWeek } from "../src/domain/setup";
import {
  anotherActivitySession,
  defaultActivities,
  routineSummary,
  toggleActivityDay,
  applyRoutineEdit,
} from "../src/domain/routine";
import {
  defaultProfile,
  emptyData,
  identity,
  type Session,
  type WeeklyRule,
} from "../src/domain/models";
import { reconstruct } from "../src/domain/history";
import {
  detectPatterns,
  generateOccurrences,
  previewOccurrences,
} from "../src/domain/schedule";
import { plannedLoad, sessionLoad } from "../src/domain/analytics";
import { planTraining } from "../src/domain/planner";
import { editTrainingWeek, saveSchedule } from "../src/schedule-storage";
const date = "2026-10-29";
const rule: WeeklyRule = {
  id: "f",
  title: "Fencing session",
  category: "Fencing",
  days: [1, 3],
  durationMinutes: null,
  time: "",
  subtype: "",
};
const actual: Session = {
  ...identity("personal", "actual"),
  date: "2026-10-26",
  title: "Fencing",
  category: "Fencing",
  durationMinutes: 90,
  time: "",
  rpe: null,
  rpeInputMode: "quick",
  sessionLoad: null,
  subtype: "",
  modality: "",
  results: "",
  notes: "",
};
beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});
it("initial setup saves the same routine to profile and default template and creates only provisional plans", async () => {
  await saveSetup({ ...initialSetup("personal"), rules: [rule] }, date);
  const d = await readData("personal");
  expect(d.profile?.weeklyRules).toEqual([rule]);
  expect(d.templates[0]).toMatchObject({
    name: "My Usual Training Week",
    source: "typical",
    rules: [rule],
  });
  expect(d.sessions).toEqual([]);
  expect(d.plans.every((p) => p.duration === null && p.rpe === null)).toBe(
    true,
  );
  expect(routineSummary(d.profile!.weeklyRules!)).toMatchObject({
    count: 2,
    knownMinutes: 0,
    unknownDuration: 2,
  });
});
it("a saved routine update preserves all actual sessions, future plans, exceptions and recurrences", async () => {
  await db.profiles.put({ ...defaultProfile(), weeklyRules: [rule] });
  await db.sessions.put(actual);
  const plans = futureFromWeek(
    [{ ...rule, durationMinutes: 90 }],
    [],
    [],
    date,
    "personal",
  );
  await db.plans.bulkPut(plans);
  const before = await readData("personal");
  await saveUsualWeek(
    "personal",
    [{ ...rule, days: [2, 4], durationMinutes: 60 }],
    [],
    [],
  );
  const after = await readData("personal");
  expect(after.sessions).toEqual(before.sessions);
  expect(after.plans).toEqual(before.plans);
  expect(after.recurrences).toEqual(before.recurrences);
  expect(after.profile?.weeklyRules?.[0].days).toEqual([2, 4]);
});
it("missing historical duration and RPE stay null and are not labeled numerical estimates", () => {
  const rows = reconstruct([rule], 4, "2026-10-28", "personal");
  expect(rows).toHaveLength(8);
  expect(
    rows.every(
      (r) =>
        r.status === "unconfirmed" &&
        r.rpe === null &&
        r.durationMinutes === null &&
        !r.estimatedFields.includes("durationMinutes"),
    ),
  ).toBe(true);
});
it("missing planned duration prevents a numeric load and numeric duration reduction", () => {
  const plans = generateOccurrences({
    dataset: "personal",
    rules: [{ ...rule, category: "Strength" }],
    start: date,
    end: "2026-11-25",
    restDays: [],
    unavailableDays: [],
  });
  expect(plannedLoad(plans.map((p) => ({ ...p, rpe: 7 })))).toBeNull();
  expect(sessionLoad(null, 7)).toBeNull();
  const d = {
    ...emptyData(),
    profile: { ...defaultProfile(), weeklyRules: [rule] },
    plans,
    tournaments: [
      {
        ...identity("personal"),
        name: "Nationals",
        startDate: "2026-11-02",
        endDate: "2026-11-02",
        priority: "A" as const,
        location: "",
        notes: "",
        goal: "",
        results: "",
      },
    ],
  };
  expect(
    planTraining(d, date).suggestions.some((s) => s.newDuration !== undefined),
  ).toBe(false);
});
it("one category can create several independent same-day sessions with stable IDs", () => {
  const a = defaultActivities[0];
  let rules = toggleActivityDay([], a, 1);
  const id = rules[0].id;
  rules.push(anotherActivitySession(a, 1));
  rules = toggleActivityDay(rules, defaultActivities[1], 1);
  expect(rules).toHaveLength(3);
  expect(new Set(rules.map((r) => r.id)).size).toBe(3);
  expect(rules[0].id).toBe(id);
});
it("changing only a week protects later occurrences and completed history", async () => {
  const r = { ...rule, durationMinutes: 90 };
  const s = {
    ...identity("personal"),
    name: "Routine",
    rules: [r],
    restDays: [],
    unavailableDays: [],
    startDate: "2026-11-02",
    endDate: "2026-11-29",
    generatedThrough: "2026-11-29",
    active: true,
  };
  await db.profiles.put(defaultProfile());
  const plans = generateOccurrences({
    dataset: "personal",
    rules: s.rules,
    start: s.startDate,
    end: s.endDate,
    restDays: [],
    unavailableDays: [],
    seriesId: s.id,
  });
  await saveSchedule(previewOccurrences(plans, emptyData()), s);
  await db.sessions.put(actual);
  const first = plans[0];
  await editTrainingWeek(first, { ...first, duration: 45 }, date);
  const d = await readData("personal");
  expect(
    d.plans
      .filter((p) => p.date <= "2026-11-08")
      .every((p) => p.duration === 45),
  ).toBe(true);
  expect(
    d.plans
      .filter((p) => p.date > "2026-11-08")
      .every((p) => p.duration === 90),
  ).toBe(true);
  expect(d.sessions).toEqual([actual]);
  expect(d.profile?.weeklyRules).toBeUndefined();
});
it("previews an individual edit as a routine change without mutating the original routine", () => {
  const p = futureFromWeek([rule], [], [], date, "personal")[0];
  const original = [rule];
  const next = applyRoutineEdit(original, {
    original: p,
    changed: { ...p, duration: 75 },
    scope: "usual",
  });
  expect(next[0].durationMinutes).toBe(75);
  expect(original[0].durationMinutes).toBeNull();
});
it("keeps distinct custom activities separate during history pattern detection", () => {
  const sessions = [0, 7, 14, 21].flatMap((offset) =>
    ["Pilates", "Climbing"].map((customActivity, i) => ({
      ...actual,
      id: `${offset}:${i}`,
      date: new Date(Date.parse("2026-09-28T12:00:00Z") + offset * 86400000)
        .toISOString()
        .slice(0, 10),
      category: "Other" as const,
      customActivity,
      title: customActivity,
    })),
  );
  const result = detectPatterns(sessions, "2026-09-28", "2026-10-25");
  expect(result.patterns).toHaveLength(2);
  expect(result.patterns.map((p) => p.rule.customActivity).sort()).toEqual([
    "Climbing",
    "Pilates",
  ]);
});
it("upgrades version 3 routines in place and accepts old backups without converting known values", async () => {
  const name = "routine-v3-migration";
  await Dexie.delete(name);
  const old = new Dexie(name);
  old
    .version(3)
    .stores(
      Object.fromEntries(
        db.tables.map((t) => [
          t.name,
          [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(
            ",",
          ),
        ]),
      ),
    );
  await old.open();
  await old.table("profiles").put({
    ...defaultProfile(),
    weeklyRules: [{ ...rule, durationMinutes: 90 }],
  });
  await old.table("sessions").put(actual);
  old.close();
  const upgraded = new AthleteDatabase(name);
  await upgraded.open();
  const d = await readData("personal", upgraded);
  expect(upgraded.verno).toBe(4);
  expect(d.templates[0].rules[0].durationMinutes).toBe(90);
  expect(d.sessions).toEqual([actual]);
  const legacy = JSON.parse(serialize(d));
  legacy.schemaVersion = 3;
  expect(parseBackup(JSON.stringify(legacy)).sessions).toEqual([actual]);
  upgraded.close();
  await Dexie.delete(name);
});

it("preserves custom activity labels in a local CSV round trip without assuming completion", () => {
  const table = parseCsvTable(
    "title,date,category,customActivity,durationMinutes,rpe,confirmationStatus\nPilates,2026-10-26,Other,Pilates,60,,completed",
  );
  const result = csvCandidates(
    table,
    table.mapping,
    defaultImportOptions("personal", "Asia/Singapore", date),
    "my-training.csv",
  );
  expect(result.records[0]).toMatchObject({
    customActivity: "Pilates",
    category: "Other",
    rpe: null,
    status: "unconfirmed",
  });
});
