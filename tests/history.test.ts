import { beforeEach, afterEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  AthleteDatabase,
  db,
  parseBackup,
  readData,
  replaceData,
  serialize,
  deleteSession,
} from "../src/db";
import { addDays } from "../src/domain/dates";
import {
  defaultProfile,
  emptyData,
  identity,
  type Session,
  type WeeklyRule,
} from "../src/domain/models";
import {
  initialSetup,
  futureFromWeek,
  setupProfile,
  typicalWeek,
} from "../src/domain/setup";
import {
  reconstruct,
  detectDuplicates,
  provenance,
  historyQuality,
} from "../src/domain/history";
import {
  csvCandidates,
  defaultImportOptions,
  icsCandidates,
  parseCsvTable,
} from "../src/domain/import-history";
import { saveReviewedHistory, saveSetup } from "../src/history-storage";
import { planTraining } from "../src/domain/planner";
import { workload } from "../src/domain/analytics";
const date = "2026-10-29",
  options = defaultImportOptions("personal", "Asia/Singapore", date);
const rules: WeeklyRule[] = [
  {
    id: "f",
    title: "Fencing",
    category: "Fencing",
    subtype: "Sparring",
    days: [1, 4],
    durationMinutes: 90,
    time: "",
  },
  {
    id: "s",
    title: "Strength",
    category: "Strength",
    subtype: "",
    days: [1],
    durationMinutes: 60,
    time: "18:00",
  },
];
const fixtureSession = (): Session => ({
  ...identity("personal", "actual"),
  date: addDays(date, -1),
  time: "18:00",
  title: "Actual training",
  category: "Fencing",
  durationMinutes: 90,
  rpe: 7,
  rpeInputMode: "quick",
  sessionLoad: 630,
  notes: "",
  subtype: "",
  modality: "",
  results: "",
});
beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});
afterEach(async () => {
  for (const t of db.tables) await t.clear();
});
describe("provisional setup and weekly planning", () => {
  it("can start without tournaments, history, wellness, RPE or a name", () => {
    const d = initialSetup("personal", "Asia/Singapore");
    const p = setupProfile(d);
    expect(p.name).toBe("Athlete");
    expect(p.frequency).toBe(0);
    expect(p.weeklyRules).toEqual([]);
    expect(p.defaultRpeMode).toBe("quick");
  });
  it("generates two exact weeks with multiple same-day sessions and unknown targets", () => {
    const plans = futureFromWeek(rules, [], [], date, "personal");
    expect(plans).toHaveLength(6);
    expect(plans.filter((p) => p.date === "2026-11-02")).toHaveLength(2);
    expect(
      plans.every(
        (p) => p.rpe === null && p.status === "planned" && p.provisional,
      ),
    ).toBe(true);
    expect(plans.find((p) => p.category === "Fencing")!.time).toBe("");
  });
  it("protects rest/unavailable days and never creates completed records", () => {
    const plans = futureFromWeek(rules, [1], [4], date, "personal");
    expect(plans.filter((p) => p.status === "planned")).toHaveLength(0);
    expect(plans.every((p) => p.status === "rest")).toBe(true);
  });
  it("personalizes descriptive hours and goals without inferring intensity", () => {
    const draft = {
      ...initialSetup("personal"),
      rules,
      primaryGoal: "Strength and power" as const,
    };
    const p = setupProfile(draft);
    expect(typicalWeek(p)).toMatchObject({ count: 3, minutes: 240 });
    expect(p.strengthPriority).toBe("Strength and power");
    const d = {
      ...emptyData(),
      profile: p,
      plans: futureFromWeek(rules, [], [], date, "personal"),
    };
    expect(planTraining(d, date)).toMatchObject({
      phase: "Build",
      provisional: true,
    });
    expect(d.sessions).toHaveLength(0);
    expect(d.checkIns).toHaveLength(0);
  });
  it("retains real history, manual plans, locked plans and profile context when a template is edited", async () => {
    await db.profiles.put({
      ...defaultProfile(),
      goals: "A specific personal goal",
      trainingContext: "Experiencing unusual fatigue",
    });
    await db.sessions.put(fixtureSession());
    const original = futureFromWeek(rules, [], [], date, "personal");
    await db.plans.bulkPut([
      { ...original[0], id: "manual", origin: "manual", duration: 33 },
      { ...original[1], id: "locked", locked: true },
    ]);
    await saveSetup({ ...initialSetup("personal"), rules }, date, true);
    expect((await readData("personal")).sessions).toEqual(
      [fixtureSession()].map((s) => ({
        ...s,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    );
    expect((await db.plans.get("manual"))?.duration).toBe(33);
    expect((await db.plans.get("locked"))?.locked).toBe(true);
    expect((await db.profiles.get("personal"))?.goals).toBe(
      "A specific personal goal",
    );
    expect((await db.profiles.get("personal"))?.trainingContext).toBe(
      "Experiencing unusual fatigue",
    );
  });
  it("persists partial onboarding, including multiple tournaments, across database reopens", async () => {
    const draft = {
      ...initialSetup("personal"),
      step: 2,
      rules,
      name: "Riley",
    };
    await db.setup.put(draft);
    db.close();
    await db.open();
    expect(await db.setup.get("personal")).toEqual(draft);
  });
});
describe("proposed history and explicit confirmation", () => {
  it("preserves separate identical untimed weekly sessions and detects repeated reconstruction", async () => {
    const sameDay = [
      { ...rules[0], days: [1] },
      { ...rules[0], id: "second-fencing", days: [1] },
    ];
    const candidates = reconstruct(sameDay, 2, addDays(date, -1), "personal");
    const reviewed = detectDuplicates(candidates, emptyData());
    expect(reviewed).toHaveLength(4);
    expect(reviewed.every((row) => row.included && !row.duplicateOf)).toBe(
      true,
    );
    await saveReviewedHistory(
      reviewed.map((row) => ({ ...row, status: "completed" })),
      "personal",
      date,
    );
    const data = await readData("personal");
    expect(data.sessions).toHaveLength(4);
    expect(
      detectDuplicates(
        reconstruct(sameDay, 2, addDays(date, -1), "personal"),
        data,
      ).every((row) => !row.included && row.duplicateOf),
    ).toBe(true);
  });
  it.each([2, 4, 6])(
    "reconstructs %i weeks without RPE or silent completion",
    (weeks) => {
      const rows = reconstruct(rules, weeks, addDays(date, -1), "personal");
      expect(rows).toHaveLength(weeks * 3);
      expect(
        rows.every(
          (r) =>
            r.date < date &&
            r.status === "unconfirmed" &&
            r.rpe === null &&
            r.estimatedFields.includes("durationMinutes"),
        ),
      ).toBe(true);
    },
  );
  it("stores missed and uncertain records separately from actual sessions", async () => {
    await db.profiles.put(defaultProfile());
    const rows = reconstruct(rules, 2, addDays(date, -1), "personal");
    rows[0].status = "completed";
    rows[1].status = "missed";
    await saveReviewedHistory(rows, "personal", date);
    const d = await readData("personal");
    expect(d.history).toHaveLength(6);
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0]).toMatchObject({
      rpe: null,
      sessionLoad: null,
      provenance: {
        source: "weekly",
        confirmationStatus: "completed",
        estimatedFields: expect.arrayContaining(["durationMinutes"]),
      },
    });
    expect(workload(d.sessions, date, 28)).toMatchObject({
      count: 1,
      load: 0,
      minutes: 90,
      missing: 1,
    });
    expect(historyQuality(d, date)).toMatchObject({
      unconfirmed: 4,
      missed: 1,
    });
  });
  it("preserves estimates separately even when an athlete remembers effort", async () => {
    const [row] = reconstruct(rules, 2, addDays(date, -1), "personal");
    row.status = "completed";
    row.rpe = 7;
    await saveReviewedHistory([row], "personal", date);
    const d = await readData("personal");
    expect(d.sessions[0].sessionLoad).toBe(630);
    expect(workload(d.sessions, date, 28)).toMatchObject({
      load: 0,
      estimatedCount: 1,
      count: 1,
    });
    expect(
      planTraining({ ...d, profile: defaultProfile() }, date).provisional,
    ).toBe(true);
  });
  it("uses explicitly confirmed actual durations in the unchanged workload formula", async () => {
    const [row] = reconstruct(rules, 2, addDays(date, -1), "personal");
    row.status = "completed";
    row.rpe = 7;
    row.estimatedFields = [];
    row.rpeInputMode = "detailed";
    await saveReviewedHistory([row], "personal", date);
    const d = await readData("personal");
    expect(workload(d.sessions, date, 28).load).toBe(630);
    expect(d.sessions[0].rpeInputMode).toBe("detailed");
  });
  it("requires duration only for a confirmed workout, not unverified proposals or tournaments", async () => {
    const [row] = reconstruct(rules, 2, addDays(date, -1), "personal");
    row.durationMinutes = null;
    await saveReviewedHistory([row], "personal", date);
    row.status = "completed";
    await expect(saveReviewedHistory([row], "personal", date)).rejects.toThrow(
      "duration",
    );
    row.kind = "tournament";
    await saveReviewedHistory([row], "personal", date);
    expect((await readData("personal")).tournaments).toHaveLength(1);
    expect((await readData("personal")).sessions).toHaveLength(0);
  });
  it("rechecks duplicate records in a stale preview and never overwrites real sessions", async () => {
    await db.sessions.put(fixtureSession());
    const rows = reconstruct(rules, 2, addDays(date, -1), "personal")
      .slice(0, 1)
      .map((r) => ({ ...r, status: "completed" as const }));
    await saveReviewedHistory(rows, "personal", date);
    const result = await saveReviewedHistory(rows, "personal", date);
    expect(result.duplicates).toBe(1);
    expect((await readData("personal")).sessions).toHaveLength(2);
    expect((await db.sessions.get("actual"))!.sessionLoad).toBe(630);
  });
  it("can resume unverified records and preserves full provenance in backups", async () => {
    await saveReviewedHistory(
      reconstruct(rules, 2, addDays(date, -1), "personal"),
      "personal",
      date,
    );
    const d = await readData("personal");
    expect(parseBackup(serialize(d)).history).toEqual(d.history);
    await replaceData(d, "sample");
    expect((await readData("sample")).history).toHaveLength(6);
    expect((await readData("personal")).history).toHaveLength(6);
  });
  it("keeps confirmation associations valid when moving a backup between datasets or deleting a session", async () => {
    const [r] = reconstruct(rules, 2, addDays(date, -1), "personal");
    r.status = "completed";
    await saveReviewedHistory([r], "personal", date);
    await replaceData(await readData("personal"), "sample");
    const d = await readData("sample");
    expect(d.sessions[0].provenance?.historyId).toBe(d.history[0].id);
    expect(d.history[0].completedSessionId).toBe(d.sessions[0].id);
    await deleteSession(d.sessions[0]);
    expect(
      parseBackup(serialize(await readData("sample"))).history[0].status,
    ).toBe("unconfirmed");
  });
});
describe("local CSV parsing", () => {
  it("maps recognizable columns, preserves quoted content and excludes unrelated entries", () => {
    const table = parseCsvTable(
      'date,title,durationMinutes,rpe,notes\n2026-10-20,"Fencing, technical",90,,"Line 1\nLine 2"\n2026-10-21,Work meeting,60,,',
    );
    const result = csvCandidates(table, table.mapping, options, "history.csv");
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      title: "Fencing, technical",
      rpe: null,
      status: "unconfirmed",
      durationMinutes: 90,
      included: true,
      notes: "Line 1\nLine 2",
    });
    expect(result.records[1].included).toBe(false);
  });
  it("converts offset timestamps to the athlete day without guessing a timezone", () => {
    const t = parseCsvTable(
      "start,title,duration\n2026-10-20T20:00:00-04:00,Fencing,90",
    );
    const r = csvCandidates(t, t.mapping, options, "x.csv").records[0];
    expect(r.date).toBe("2026-10-21");
    expect(r.time).toBe("08:00");
  });
  it("warns on ambiguous dates and accepts an explicit date order", () => {
    const t = parseCsvTable("date,title,duration\n10/11/2026,Fencing,90");
    const o = { ...options, to: "2026-12-01" };
    expect(csvCandidates(t, t.mapping, o, "x").warnings[0]).toContain(
      "Ambiguous",
    );
    expect(
      csvCandidates(t, t.mapping, { ...o, dateOrder: "DMY" }, "x").records[0]
        .date,
    ).toBe("2026-11-10");
  });
  it("accepts missing effort, retains deliberate zero and rejects fractional effort without inventing a rating", () => {
    const t = parseCsvTable(
      "date,title,duration,rpe\n2026-10-20,Fencing,90,\n2026-10-21,Strength,60,0\n2026-10-22,Conditioning,30,7.5",
    );
    const r = csvCandidates(t, t.mapping, options, "x").records;
    expect(r.map((r) => r.rpe)).toEqual([null, 0, null]);
    expect(r[2].warnings[0]).toContain("Invalid RPE");
  });
  it("supports explicit units and rejects malformed files", () => {
    const t = parseCsvTable(
      "date,title,durationSeconds\n2026-10-20,Fencing,5400",
    );
    expect(
      csvCandidates(t, t.mapping, options, "x").records[0].durationMinutes,
    ).toBe(90);
    expect(() => parseCsvTable("")).toThrow();
    expect(() => parseCsvTable("one-column")).toThrow();
    expect(() => parseCsvTable('date,title\n"bad,Fencing')).toThrow();
  });
  it("detects likely duplicates in the file and against existing sessions", () => {
    const t = parseCsvTable(
      "date,title,duration\n2026-10-28,Actual training,90\n2026-10-28,Actual training,90",
    );
    const rows = csvCandidates(t, t.mapping, options, "x").records;
    const checked = detectDuplicates(rows, {
      ...emptyData(),
      sessions: [fixtureSession()],
    });
    expect(
      checked.every((r) => r.duplicateOf === "actual" && !r.included),
    ).toBe(true);
  });
});
const calendar = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AthleteOS tests//EN\r\n${events}\r\nEND:VCALENDAR`;
const event = (body: string) => `BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT`;
describe("local ICS expansion and timezones", () => {
  it("expands recurrence, EXDATE and RDATE while never verifying attendance", () => {
    const ics = calendar(
      event(
        "UID:training\r\nDTSTART;TZID=Asia/Singapore:20261005T180000\r\nDTEND;TZID=Asia/Singapore:20261005T193000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE;TZID=Asia/Singapore:20261012T180000\r\nRDATE;TZID=Asia/Singapore:20261020T180000\r\nSUMMARY:Fencing",
      ),
    );
    const result = icsCandidates(ics, options, "calendar.ics");
    expect(result.warnings).toEqual([]);
    expect(result.records.map((r) => r.date)).toEqual([
      "2026-10-05",
      "2026-10-19",
      "2026-10-20",
      "2026-10-26",
    ]);
    expect(
      result.records.every(
        (r) =>
          r.rpe === null &&
          r.status === "unconfirmed" &&
          r.durationMinutes === 90 &&
          r.estimatedFields.includes("durationMinutes"),
      ),
    ).toBe(true);
  });
  it("handles moved recurrence exceptions and cancelled events", () => {
    const ics = calendar(
      event(
        "UID:f\r\nDTSTART:20261005T100000Z\r\nDTEND:20261005T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Fencing",
      ) +
        "\r\n" +
        event(
          "UID:f\r\nRECURRENCE-ID:20261012T100000Z\r\nDTSTART:20261013T110000Z\r\nDTEND:20261013T120000Z\r\nSUMMARY:Strength",
        ) +
        "\r\n" +
        event(
          "UID:f\r\nRECURRENCE-ID:20261019T100000Z\r\nDTSTART:20261019T100000Z\r\nDTEND:20261019T110000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Fencing",
        ),
    );
    const r = icsCandidates(ics, options, "x");
    expect(r.records.map((r) => r.date)).toEqual(["2026-10-05", "2026-10-13"]);
  });
  it("preserves local recurrence time across DST and converts correctly to the athlete timezone", () => {
    const ics = calendar(
      event(
        "UID:dst\r\nDTSTART;TZID=America/New_York:20261025T100000\r\nDTEND;TZID=America/New_York:20261025T110000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Fencing",
      ),
    );
    const r = icsCandidates(ics, { ...options, to: "2026-11-10" }, "x");
    expect(r.records.map((r) => r.time)).toEqual(["22:00", "23:00", "23:00"]);
  });
  it("treats all-day multi-day tournaments as events without invented exercise duration", () => {
    const r = icsCandidates(
      calendar(
        event(
          "UID:cup\r\nDTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261012\r\nSUMMARY:National Championship",
        ),
      ),
      options,
      "x",
    ).records[0];
    expect(r).toMatchObject({
      kind: "tournament",
      date: "2026-10-10",
      endDate: "2026-10-11",
      durationMinutes: null,
      rpe: null,
      status: "unconfirmed",
    });
  });
  it("uses embedded VTIMEZONE definitions for custom timezone identifiers", () => {
    const tz =
      "BEGIN:VTIMEZONE\r\nTZID:Custom/India\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0530\r\nTZOFFSETTO:+0530\r\nEND:STANDARD\r\nEND:VTIMEZONE";
    const r = icsCandidates(
      calendar(
        tz +
          "\r\n" +
          event(
            "UID:custom\r\nDTSTART;TZID=Custom/India:20261020T180000\r\nDTEND;TZID=Custom/India:20261020T190000\r\nSUMMARY:Fencing",
          ),
      ),
      options,
      "x",
    );
    expect(r.records[0].time).toBe("20:30");
  });
  it("reports unsupported timezones and only falls back when explicitly selected", () => {
    const ics = calendar(
      event(
        "UID:unknown\r\nDTSTART;TZID=Unsupported:20261020T180000\r\nDTEND;TZID=Unsupported:20261020T190000\r\nSUMMARY:Fencing",
      ),
    );
    expect(icsCandidates(ics, options, "x").records).toHaveLength(0);
    const r = icsCandidates(
      ics,
      { ...options, allowUnknownTimezone: true },
      "x",
    );
    expect(r.records).toHaveLength(1);
    expect(r.warnings[0]).toContain("Unsupported TZID");
    expect(() => icsCandidates("not a calendar", options, "x")).toThrow(
      "valid ICS",
    );
  });
});
it("upgrades schema 1 IndexedDB in place and accepts old JSON backups without deleting actual training", async () => {
  const name = "athleteos-migration-" + crypto.randomUUID();
  const legacy = new Dexie(name);
  legacy.version(1).stores({
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
  await legacy.table("profiles").put(defaultProfile());
  await legacy.table("sessions").put(fixtureSession());
  legacy.close();
  const upgraded = new AthleteDatabase(name);
  const d = await readData("personal", upgraded);
  expect(d.sessions[0].sessionLoad).toBe(630);
  expect(d.history).toEqual([]);
  expect(upgraded.verno).toBe(4);
  const old = JSON.parse(serialize(d));
  old.schemaVersion = 1;
  delete old.history;
  expect(parseBackup(JSON.stringify(old)).history).toEqual([]);
  upgraded.close();
  await upgraded.delete();
});

it("does not invent availability constraints when a new athlete skipped the typical week", () => {
  const profile = setupProfile(initialSetup("personal"));
  const plan = futureFromWeek(rules, [], [], date, "personal")[0];
  const result = planTraining({ ...emptyData(), profile, plans: [plan] }, date);
  expect(result.provisional).toBe(true);
  expect(result.suggestions.some((s) => s.key.startsWith("availability"))).toBe(
    false,
  );
});
it("retains estimated duration flags when a training CSV is imported on a fresh device", () => {
  const t = parseCsvTable(
    "date,title,durationMinutes,rpe,durationQuality\n2026-10-20,Fencing,90,7,estimated",
  );
  const row = csvCandidates(t, t.mapping, options, "export.csv").records[0];
  expect(row.estimatedFields).toContain("durationMinutes");
  expect(row.rpe).toBe(7);
  expect(row.time).toBe("");
});
it("accepts a cancellation exception that does not repeat DTSTART", () => {
  const ics = calendar(
    event(
      "UID:f\r\nDTSTART:20261005T100000Z\r\nDTEND:20261005T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Fencing",
    ) +
      "\r\n" +
      event("UID:f\r\nRECURRENCE-ID:20261012T100000Z\r\nSTATUS:CANCELLED"),
  );
  const r = icsCandidates(ics, options, "x");
  expect(r.warnings).toEqual([]);
  expect(r.records.map((r) => r.date)).toEqual(["2026-10-05", "2026-10-19"]);
});
it("detects reconstructed duplicates across different templates without merging intentional same-day slots", async () => {
  const one = { ...rules[0], days: [1] };
  const originals = reconstruct([one], 2, addDays(date, -1), "personal");
  await saveReviewedHistory(
    originals.map((r) => ({ ...r, status: "completed" })),
    "personal",
    date,
  );
  const newTemplate = [
    { ...one, id: "new-first" },
    { ...one, id: "new-second" },
  ];
  const proposed = detectDuplicates(
    reconstruct(newTemplate, 2, addDays(date, -1), "personal"),
    await readData("personal"),
  );
  expect(proposed.filter((r) => r.included)).toHaveLength(2);
  await saveReviewedHistory(
    proposed.map((r) => ({ ...r, status: "completed" })),
    "personal",
    date,
  );
  expect(await db.sessions.count()).toBe(4);
  const repeated = detectDuplicates(
    reconstruct(newTemplate, 2, addDays(date, -1), "personal"),
    await readData("personal"),
  );
  expect(repeated.every((r) => !r.included)).toBe(true);
});
