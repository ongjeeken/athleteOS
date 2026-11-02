import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  db,
  readData,
  serialize,
  parseBackup,
  replaceData,
  saveSession,
  AthleteDatabase,
  applySuggestion,
  undoDecision,
} from "../src/db";
import {
  defaultProfile,
  emptyData,
  identity,
  type Session,
  type WeeklyRule,
  type RecurringSchedule,
} from "../src/domain/models";
import {
  detectPatterns,
  historyRange,
  defaultPatternOptions,
  parseSchedule,
  generateOccurrences,
  previewOccurrences,
} from "../src/domain/schedule";
import { addDays } from "../src/domain/dates";
import {
  saveSchedule,
  saveTemplate,
  editOccurrence,
  skipOccurrence,
  updateSeries,
  endSeries,
  extendRecurringSchedules,
  undoSchedule,
} from "../src/schedule-storage";
import { planTraining } from "../src/domain/planner";
import { workload } from "../src/domain/analytics";
const date = "2026-10-29";
const rules: WeeklyRule[] = [
  {
    id: "strength",
    title: "Gym",
    category: "Strength",
    subtype: "",
    days: [1],
    durationMinutes: 60,
    time: "",
    timeOfDay: "Morning",
  },
  {
    id: "fencing",
    title: "Fencing",
    category: "Fencing",
    subtype: "",
    days: [1, 3],
    durationMinutes: 120,
    time: "",
    timeOfDay: "Evening",
  },
];
function session(
  id: string,
  date: string,
  category: Session["category"] = "Fencing",
  durationMinutes = 120,
  time = "18:00",
): Session {
  return {
    ...identity("personal", id),
    date,
    category,
    durationMinutes,
    time,
    title: category,
    rpe: null,
    rpeInputMode: "quick",
    sessionLoad: null,
    notes: "",
    subtype: "",
    modality: "",
    results: "",
  };
}
function fourWeeks() {
  const out: Session[] = [];
  for (let w = 0; w < 4; w++) {
    const mon = addDays("2026-09-28", w * 7);
    out.push(
      session(`s${w}`, mon, "Strength", [55, 60, 65, 180][w], "08:00"),
      session(`f${w}`, mon, "Fencing", [100, 120, 120, 140][w]),
      session(`w${w}`, addDays(mon, 2)),
    );
  }
  return out;
}
function series(
  start = date,
  end: string | null = addDays(date, 55),
): RecurringSchedule {
  return {
    ...identity("personal"),
    name: "Normal week",
    rules,
    restDays: [],
    unavailableDays: [],
    startDate: start,
    endDate: end,
    generatedThrough: end ?? addDays(start, 83),
    active: true,
  };
}
async function create(s = series()) {
  const data = { ...emptyData(), profile: defaultProfile() };
  const ps = generateOccurrences({
    dataset: "personal",
    rules: s.rules,
    restDays: [],
    unavailableDays: [],
    start: s.startDate,
    end: s.generatedThrough,
    seriesId: s.id,
  });
  await saveSchedule(previewOccurrences(ps, data), s);
  return s;
}
beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  await db.profiles.put(defaultProfile());
});
describe("explainable history-derived routines", () => {
  it("uses four completed weeks, independent AM/PM slots and robust median durations", () => {
    const detected = detectPatterns(fourWeeks(), "2026-09-28", "2026-10-25");
    expect(detected.patterns).toHaveLength(3);
    expect(detected.patterns.every((p) => p.included)).toBe(true);
    expect(
      detected.patterns.find((p) => p.rule.category === "Strength")!.rule,
    ).toMatchObject({ durationMinutes: 60, timeOfDay: "Morning" });
    expect(
      detected.patterns.filter((p) => p.rule.days.includes(1)),
    ).toHaveLength(2);
    expect(detected.excluded[0].reason).toContain("Unusually long");
  });
  it("preserves multiple identical untimed sessions rather than combining their durations", () => {
    const actual = fourWeeks()
      .filter((s) => s.category === "Fencing")
      .map((s) => ({ ...s, time: "" }));
    const extra = actual
      .filter((s) => s.id.startsWith("f"))
      .map((s) => ({ ...s, id: s.id + "second", durationMinutes: 90 }));
    const r = detectPatterns([...actual, ...extra], "2026-09-28", "2026-10-25");
    expect(r.patterns.filter((p) => p.rule.days.includes(1))).toHaveLength(2);
    expect(r.patterns.every((p) => p.rule.durationMinutes <= 140)).toBe(true);
  });
  it("excludes tournaments, camps and estimated durations with an explanation", () => {
    const camp = { ...session("camp", "2026-10-10"), title: "Training camp" };
    const tournament = session("cup", "2026-10-11", "Competition", 240);
    const estimated = {
      ...session("est", "2026-10-12"),
      provenance: {
        source: "weekly" as const,
        sourceName: "Typical",
        sourceKey: "x",
        timezone: "Asia/Singapore",
        estimatedFields: ["durationMinutes" as const],
        confirmationStatus: "completed" as const,
        confirmedAt: new Date().toISOString(),
      },
    };
    const r = detectPatterns(
      [camp, tournament, estimated],
      "2026-09-28",
      "2026-10-25",
    );
    expect(r.patterns).toEqual([]);
    expect(r.excluded).toHaveLength(3);
    expect(
      detectPatterns([estimated], "2026-09-28", "2026-10-25", {
        ...defaultPatternOptions,
        includeEstimates: true,
      }).patterns[0].estimated,
    ).toBe(true);
  });
  it("leaves irregular or insufficient evidence for the athlete to choose", () => {
    const r = detectPatterns(
      [session("a", "2026-10-05")],
      "2026-09-28",
      "2026-10-25",
    );
    expect(r.patterns[0].included).toBe(false);
    expect(r.patterns[0].reason).toContain("inconsistent");
    expect(detectPatterns([], "2026-09-28", "2026-10-25").patterns).toEqual([]);
  });
  it("supports an explicit last-completed-week copy without calling it a recurring pattern", () => {
    expect(historyRange(date, 1)).toEqual({
      start: "2026-10-19",
      end: "2026-10-25",
    });
    const r = detectPatterns(fourWeeks(), "2026-10-19", "2026-10-25", {
      ...defaultPatternOptions,
      copyWeek: true,
    });
    expect(r.patterns).toHaveLength(3);
    expect(
      r.patterns.every((p) => p.included && p.reason.includes("one-week copy")),
    ).toBe(true);
  });
  it("uses configurable frequency thresholds and records source IDs", () => {
    const r = detectPatterns(
      fourWeeks().filter((s) => s.id !== "f3"),
      "2026-09-28",
      "2026-10-25",
      { ...defaultPatternOptions, minShare: 1 },
    );
    const p = r.patterns.find(
      (p) => p.rule.category === "Fencing" && p.rule.days[0] === 1,
    )!;
    expect(p.included).toBe(false);
    expect(p.sourceIds).toEqual(["f0", "f1", "f2"]);
  });
});
describe("offline text entry and occurrence generation", () => {
  it("parses multiple sessions per day, AM/PM, durations, dates and optional exact times", () => {
    const r = parseSchedule(
      "Mon: Gym 60m AM, Fencing 2h PM\nWed: Conditioning 30m AM, Fencing 90m PM\nSat: Footwork 45m, Sparring 120m",
    );
    expect(r.rules).toHaveLength(6);
    expect(r.rules[0]).toMatchObject({
      category: "Strength",
      durationMinutes: 60,
      timeOfDay: "Morning",
    });
    expect(r.rules[1]).toMatchObject({
      durationMinutes: 120,
      timeOfDay: "Evening",
    });
    expect(r.warnings).toEqual([]);
    const d = parseSchedule("2026-11-02: Gym 60m 08:00");
    expect(d.dated[0].date).toBe("2026-11-02");
    expect(d.rules[0].time).toBe("08:00");
  });
  it("flags ambiguous entries and never infers duration or RPE", () => {
    const r = parseSchedule(
      "Tomorrow gym\nMon: fencing hard, mystery activity 60m\n2026-02-31: Gym 60m",
    );
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0].category).toBe("Other");
    expect(r.warnings).toHaveLength(4);
  });
  it("generates eight weeks and retains every same-day session as independent records", () => {
    const ps = generateOccurrences({
      dataset: "personal",
      rules,
      start: "2026-11-02",
      end: "2026-12-27",
      restDays: [],
      unavailableDays: [],
    });
    expect(ps).toHaveLength(24);
    expect(new Set(ps.map((p) => p.id)).size).toBe(24);
    expect(ps.filter((p) => p.date === "2026-11-02")).toHaveLength(2);
    expect(ps.every((p) => p.rpe === null && p.status === "planned")).toBe(
      true,
    );
  });
  it("supports exact one-week copying, custom ranges and protected days", () => {
    const ps = generateOccurrences({
      dataset: "personal",
      rules,
      start: "2026-11-02",
      end: "2026-11-08",
      restDays: [3],
      unavailableDays: [],
    });
    expect(ps).toHaveLength(2);
    expect(() =>
      generateOccurrences({
        dataset: "personal",
        rules,
        start: date,
        end: addDays(date, -1),
        restDays: [],
        unavailableDays: [],
      }),
    ).toThrow();
  });
  it("detects actual/planned duplicates and tournament conflicts without removing independent slots", () => {
    const plans = generateOccurrences({
      dataset: "personal",
      rules,
      start: "2026-11-02",
      end: "2026-11-08",
      restDays: [],
      unavailableDays: [],
    });
    const d = {
      ...emptyData(),
      profile: defaultProfile(),
      plans: [plans[0]],
      tournaments: [
        {
          ...identity("personal"),
          name: "Nationals",
          startDate: "2026-11-02",
          endDate: "2026-11-03",
          priority: "A" as const,
          location: "",
          goal: "",
          results: "",
          notes: "",
        },
      ],
    };
    const r = previewOccurrences(plans, d);
    expect(r[0].duplicateOf).toBe(plans[0].id);
    expect(r[1].included).toBe(true);
    expect(r[1].conflicts[0]).toContain("Nationals");
  });
});
describe("durable recurrence and history preservation", () => {
  it("saves an eight-week series transactionally and rejects a stale duplicate preview", async () => {
    const s = await create();
    expect((await readData("personal")).plans).toHaveLength(24);
    const repeated = generateOccurrences({
      dataset: "personal",
      rules,
      start: s.startDate,
      end: s.generatedThrough,
      restDays: [],
      unavailableDays: [],
    });
    const result = await saveSchedule(
      previewOccurrences(repeated, {
        ...emptyData(),
        profile: defaultProfile(),
      }),
    );
    expect(result.saved).toBe(0);
    expect(await db.plans.count()).toBe(24);
  });
  it("edits one occurrence without changing its siblings, with explicit exception metadata", async () => {
    await create();
    const plans = await db.plans.toArray();
    await editOccurrence({ ...plans[0], duration: 35 });
    expect((await db.plans.get(plans[0].id))?.duration).toBe(35);
    expect(await db.plans.get(plans[1].id)).toEqual(plans[1]);
    expect((await db.recurrenceExceptions.toArray())[0]).toMatchObject({
      action: "edited",
      planId: plans[0].id,
    });
  });
  it("preserves completed workouts, locked plans, edited occurrences and skips when a series changes", async () => {
    const s = await create();
    const ps = (await db.plans.toArray()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const actual = {
      ...session("actual", ps[0].date, ps[0].category, 75),
      plannedSessionId: ps[0].id,
    };
    await saveSession(actual);
    await editOccurrence({ ...ps[1], duration: 33 });
    await db.plans.update(ps[2].id, { locked: true });
    await skipOccurrence(ps[3]);
    await updateSeries(
      { ...s, rules: s.rules.map((r) => ({ ...r, durationMinutes: 45 })) },
      date,
      "entire",
      date,
    );
    const d = await readData("personal");
    expect(d.sessions).toEqual([actual]);
    expect(d.plans.find((p) => p.id === ps[0].id)?.status).toBe("completed");
    expect(d.plans.find((p) => p.id === ps[1].id)?.duration).toBe(33);
    expect(d.plans.find((p) => p.id === ps[2].id)?.locked).toBe(true);
    expect(
      d.plans.some(
        (p) =>
          p.date === ps[3].date && p.templateRuleId === ps[3].templateRuleId,
      ),
    ).toBe(false);
    expect(
      d.plans
        .filter(
          (p) => p.status === "planned" && !p.occurrenceEdited && !p.locked,
        )
        .every((p) => p.duration === 45),
    ).toBe(true);
    expect(workload(d.sessions, actual.date, 90).count).toBe(1);
  });
  it("supports this-and-future edits while leaving earlier plans and unrelated data intact", async () => {
    const s = await create();
    const before = await db.plans.toArray();
    const cutoff = addDays(date, 21);
    await updateSeries(
      { ...s, rules: s.rules.map((r) => ({ ...r, durationMinutes: 40 })) },
      cutoff,
      "future",
      date,
    );
    const after = await db.plans.toArray();
    expect(after.filter((p) => p.date < cutoff)).toEqual(
      before.filter((p) => p.date < cutoff),
    );
    expect(
      after.filter((p) => p.date >= cutoff).every((p) => p.duration === 40),
    ).toBe(true);
  });
  it("extends ongoing schedules on later app use without duplicates or reviving skips", async () => {
    const s = await create(series(date, null));
    const oldCount = await db.plans.count();
    const p = (await db.plans.toArray())[0];
    await skipOccurrence(p);
    await extendRecurringSchedules("personal", addDays(date, 14));
    const after = await db.plans.toArray();
    expect(after.length).toBeGreaterThan(oldCount);
    expect(
      after.some(
        (x) => x.date === p.date && x.templateRuleId === p.templateRuleId,
      ),
    ).toBe(false);
    const n = after.length;
    await extendRecurringSchedules("personal", addDays(date, 14));
    expect(await db.plans.count()).toBe(n);
    expect((await db.recurrences.get(s.id))?.endDate).toBeNull();
  });
  it("ends future recurrence and provides undo without removing edited or completed training", async () => {
    const s = await create();
    const plans = await db.plans.toArray();
    await editOccurrence({ ...plans[0], duration: 31 });
    await endSeries(s.id, date, date);
    expect(await db.plans.count()).toBe(1);
    expect((await db.recurrences.get(s.id))?.active).toBe(false);
    const second = await create(series(addDays(date, 70), addDays(date, 125)));
    const batch = (await db.plans.where("seriesId").equals(second.id).first())!
      .planningBatchId!;
    await undoSchedule(batch, "personal");
    expect(await db.plans.count()).toBe(1);
  });
  it("keeps history-derived templates editable and restores schedules after database restart/backup", async () => {
    const source = fourWeeks();
    await db.sessions.bulkPut(source);
    const detected = detectPatterns(source, "2026-09-28", "2026-10-25");
    const t = {
      ...identity("personal"),
      name: "My pattern",
      rules: detected.patterns.map((p) => p.rule),
      restDays: [],
      unavailableDays: [],
      source: "history" as const,
      sourceSessionIds: source.map((s) => s.id),
      sourceStart: "2026-09-28",
      sourceEnd: "2026-10-25",
    };
    await saveTemplate(t);
    await saveTemplate({
      ...t,
      name: "Renamed",
      rules: t.rules.map((r) => ({ ...r, durationMinutes: 55 })),
    });
    await create();
    db.close();
    await db.open();
    const d = await readData("personal");
    expect(d.templates[0].name).toBe("Renamed");
    const parsed = parseBackup(serialize(d));
    await replaceData(parsed, "sample");
    const sample = await readData("sample");
    expect(sample.recurrences).toHaveLength(1);
    expect(
      sample.plans.every((p) => p.seriesId === sample.recurrences[0].id),
    ).toBe(true);
    expect(
      sample.templates[0].sourceSessionIds.every((id) =>
        id.startsWith("sample:"),
      ),
    ).toBe(true);
  });
  it("passes proposed schedules into the existing planner without changing actual load", async () => {
    const s = await create();
    const d = await readData("personal");
    d.profile = { ...d.profile!, weeklyRules: rules };
    d.tournaments = [
      {
        ...identity("personal"),
        name: "Major cup",
        startDate: addDays(date, 4),
        endDate: addDays(date, 4),
        priority: "A",
        location: "",
        goal: "",
        results: "",
        notes: "",
      },
    ];
    const result = planTraining(d, date);
    expect(result.phase).toBe("Taper");
    expect(result.provisional).toBe(true);
    expect(workload(d.sessions, date, 28)).toMatchObject({ count: 0, load: 0 });
    expect((await db.recurrences.get(s.id))?.rules).toEqual(rules);
  });
  it("migrates schema 2 and backup schema 2 without losing completed data", async () => {
    const name = "schedule-v2-migration";
    await Dexie.delete(name);
    const old = new Dexie(name);
    old.version(2).stores({
      profiles: "id",
      history: "id,dataset,date,batchId,sourceKey",
      setup: "id,dataset",
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
    await old.open();
    await old.table("sessions").put(session("legacy", "2026-10-19"));
    old.close();
    const upgraded = new AthleteDatabase(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(4);
    const d = await readData("personal", upgraded);
    expect(d.sessions).toHaveLength(1);
    expect(d.templates).toEqual([]);
    const backup = JSON.parse(serialize(d));
    backup.schemaVersion = 2;
    delete backup.templates;
    delete backup.recurrences;
    delete backup.recurrenceExceptions;
    expect(parseBackup(JSON.stringify(backup)).sessions).toHaveLength(1);
    upgraded.close();
    await Dexie.delete(name);
  });
});

it("matches existing duplicates one-for-one so a second intentional untimed session can still be added", async () => {
  const two = [
    { ...rules[0], id: "first", timeOfDay: "Any time" as const },
    { ...rules[0], id: "second", timeOfDay: "Any time" as const },
  ];
  const plans = generateOccurrences({
    dataset: "personal",
    rules: two,
    restDays: [],
    unavailableDays: [],
    start: "2026-11-02",
    end: "2026-11-02",
  });
  await db.plans.put({
    ...plans[0],
    id: "already-planned",
    templateRuleId: "older-rule",
  });
  const preview = previewOccurrences(plans, await readData("personal"));
  expect(preview.map((r) => r.included)).toEqual([false, true]);
  expect((await saveSchedule(preview)).saved).toBe(1);
  expect(await db.plans.count()).toBe(2);
  expect((await saveSchedule(preview)).saved).toBe(0);
});
it("counts a linked planned/completed workout once during duplicate detection", () => {
  const plans = generateOccurrences({
    dataset: "personal",
    rules: [
      { ...rules[0], id: "one" },
      { ...rules[0], id: "two" },
    ],
    restDays: [],
    unavailableDays: [],
    start: "2026-11-02",
    end: "2026-11-02",
  });
  const p = { ...plans[0], id: "completed-plan", status: "completed" as const };
  const actual = {
    ...session("completed", p.date, "Strength", 60, ""),
    title: p.title,
    timeOfDay: p.timeOfDay,
    plannedSessionId: p.id,
  };
  const preview = previewOccurrences(plans, {
    ...emptyData(),
    plans: [p],
    sessions: [actual],
  });
  expect(preview.map((r) => r.included)).toEqual([false, true]);
});
it("records excluded recurring occurrences as skips and retains them during a later series update", async () => {
  const s = series();
  const plans = generateOccurrences({
    dataset: "personal",
    rules,
    restDays: [],
    unavailableDays: [],
    start: s.startDate,
    end: s.generatedThrough,
    seriesId: s.id,
  });
  const preview = previewOccurrences(plans, emptyData());
  preview[0].included = false;
  await saveSchedule(preview, s);
  await updateSeries(s, date, "entire", date);
  const after = await db.plans.toArray();
  expect(after).toHaveLength(23);
  expect(
    after.some(
      (p) =>
        p.date === plans[0].date &&
        p.templateRuleId === plans[0].templateRuleId,
    ),
  ).toBe(false);
});
it("rejects invalid pattern settings rather than inventing a routine", () => {
  expect(() =>
    detectPatterns(fourWeeks(), "2026-09-28", "2026-10-25", {
      ...defaultPatternOptions,
      minShare: 0,
    }),
  ).toThrow("threshold");
});
it("ending a future series before it starts removes its first day as well", async () => {
  const s = await create(series("2026-11-02", "2026-12-27"));
  await endSeries(s.id, date, date);
  expect(await db.plans.count()).toBe(0);
  expect((await db.recurrences.get(s.id))?.active).toBe(false);
});

it("preserves an indefinite preview horizon that begins beyond today", async () => {
  const s = await create(series("2026-11-02", null));
  const extended = { ...s, generatedThrough: "2027-02-28" };
  await updateSeries(extended, "2026-12-07", "future", date);
  expect((await db.recurrences.get(s.id))?.generatedThrough).toBe("2027-02-28");
  expect((await db.plans.toArray()).some((p) => p.date > "2027-02-01")).toBe(
    true,
  );
});
it("backs up and undoes accepted recurring-plan suggestions with valid remapped series associations", async () => {
  await create();
  const p = (await db.plans.toArray())[0];
  await applySuggestion(
    {
      key: "reduce",
      title: "Review volume",
      text: "Athlete chose to reduce",
      why: "Competition proximity",
      uncertainty: "Heuristic",
      classification: "Planning heuristic",
      inputIds: [p.id],
      planId: p.id,
      newDuration: 30,
    },
    "personal",
    date,
  );
  expect((await db.plans.get(p.id))?.occurrenceEdited).toBe(true);
  await replaceData(
    parseBackup(serialize(await readData("personal"))),
    "sample",
  );
  const copied = await readData("sample");
  expect(copied.decisions[0].original?.seriesId).toBe(copied.recurrences[0].id);
  await undoDecision(copied.decisions[0]);
  const restored = await readData("sample");
  expect(restored.recurrenceExceptions).toEqual([]);
  expect(() => parseBackup(serialize(restored))).not.toThrow();
});
