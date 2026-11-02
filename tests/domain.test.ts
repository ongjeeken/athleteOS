import { describe, expect, it } from "vitest";
import { addDays, today, weekStart } from "../src/domain/dates";
import {
  baseline,
  dailyLoad,
  sessionLoad,
  workload,
} from "../src/domain/analytics";
import {
  defaultProfile,
  emptyData,
  identity,
  sessionSchema,
  type CheckIn,
  type Data,
  type Plan,
  type Session,
  type Tournament,
} from "../src/domain/models";
import { planTraining } from "../src/domain/planner";
import { sampleData } from "../src/domain/sample";
import { csv, parseBackup, serialize } from "../src/db";
const date = "2026-12-31";
const session = (
  id: string,
  d = date,
  rpe: number | null = 7,
  durationMinutes = 90,
): Session => ({
  ...identity("personal", id),
  date: d,
  time: "18:00",
  title: "Fencing",
  category: "Fencing",
  durationMinutes,
  rpe,
  rpeInputMode: "quick",
  sessionLoad: sessionLoad(durationMinutes, rpe),
  notes: "",
  subtype: "",
  modality: "",
  results: "",
});
const tournament = (
  id: string,
  priority: "A" | "B" | "C",
  offset: number,
): Tournament => ({
  ...identity("personal", id),
  name: id,
  startDate: addDays(date, offset),
  endDate: addDays(date, offset),
  priority,
  location: "",
  notes: "",
  goal: "",
  results: "",
});
const full = (): Data => ({
  ...emptyData(),
  profile: defaultProfile(),
  sessions: [
    session("1", addDays(date, -8)),
    session("2", addDays(date, -6)),
    session("3", addDays(date, -4)),
    session("4", addDays(date, -2)),
  ],
});
const check = (d: string, fatigue = 2): CheckIn => ({
  ...identity("personal", d),
  date: d,
  sleep: 4,
  energy: 4,
  fatigue,
  soreness: 2,
  stress: 2,
  notes: "",
});
describe("workload calculation and calendar boundaries", () => {
  it("90 minutes × RPE 7 = 630 AU", () => expect(sessionLoad(90, 7)).toBe(630));
  it("missing RPE stays unknown, while deliberate zero is zero", () => {
    expect(sessionLoad(90, null)).toBeNull();
    expect(sessionLoad(90, undefined)).toBeNull();
    expect(sessionLoad(90, 0)).toBe(0);
  });
  it("aggregates multiple daily sessions and counts an ID only once", () => {
    const s = session("1");
    expect(workload([s, s, session("2", date, 5, 30)], date, 1)).toMatchObject({
      load: 780,
      count: 2,
      days: 1,
    });
  });
  it("reflects edits and deletion without stale derived data", () => {
    const rows = [session("1"), session("2")];
    expect(workload(rows, date, 7).load).toBe(1260);
    expect(workload([session("1", date, 3), rows[1]], date, 7).load).toBe(900);
    expect(workload([rows[1]], date, 7).load).toBe(630);
  });
  it("7-day window includes today and six prior days only", () =>
    expect(
      workload(
        [
          session("a"),
          session("b", addDays(date, -6)),
          session("c", addDays(date, -7)),
          session("d", addDays(date, 1)),
        ],
        date,
        7,
      ),
    ).toMatchObject({ load: 1260, count: 2 }));
  it("28-day window spans month and year correctly", () =>
    expect(
      workload(
        [
          session("a", "2027-01-01"),
          session("b", "2026-12-05"),
          session("c", "2026-12-04"),
        ],
        "2027-01-01",
        28,
      ).load,
    ).toBe(1260));
  it("competition event itself does not add workload", () => {
    const d = full();
    d.tournaments = [tournament("cup", "C", 0)];
    d.sessions = [
      {
        ...session("competition"),
        category: "Competition",
        tournamentId: "cup",
      },
    ];
    expect(workload(d.sessions, date, 28).load).toBe(630);
  });
  it("daily gaps remain null and missing RPE is visible", () => {
    const rows = dailyLoad([session("a", date, null)], addDays(date, -1), 2);
    expect(rows[0].load).toBeNull();
    expect(rows[1]).toMatchObject({ load: null, missing: 1 });
  });
  it("calendar date arithmetic is timezone independent around the new year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(today("Asia/Singapore", new Date("2026-12-31T17:00:00Z"))).toBe(
      "2027-01-01",
    );
    expect(today("America/New_York", new Date("2026-12-31T17:00:00Z"))).toBe(
      "2026-12-31",
    );
  });
});
describe("deterministic planning", () => {
  it("A events trigger a preparation window", () => {
    const d = full();
    d.tournaments = [tournament("nationals", "A", 6)];
    expect(planTraining(d, date).phase).toBe("Taper");
    expect(planTraining(d, date).suggestions[0].inputIds).toContain(
      "nationals",
    );
  });
  it("B events use a shorter configurable window", () => {
    const d = full();
    d.tournaments = [tournament("regionals", "B", 4)];
    expect(planTraining(d, date).phase).toBe("Maintain");
    d.profile!.windows.B = 5;
    expect(planTraining(d, date).phase).toBe("Taper");
  });
  it("C events do not trigger a default full taper", () => {
    const d = full();
    d.tournaments = [tournament("club", "C", 1)];
    expect(planTraining(d, date).phase).toBe("Maintain");
    expect(
      planTraining(d, date).suggestions.some((s) => s.key.startsWith("taper")),
    ).toBe(false);
  });
  it("consecutive competitions produce one combined block and no duplicate taper action", () => {
    const d = full();
    d.tournaments = [
      tournament("club", "C", 2),
      tournament("nationals", "A", 8),
      tournament("regional", "B", 13),
    ];
    const p = planTraining(d, date);
    expect(
      p.suggestions.filter((s) => s.key.startsWith("cluster")),
    ).toHaveLength(1);
    expect(p.suggestions.some((s) => s.key.startsWith("taper"))).toBe(false);
  });
  it("sparse history reports insufficient data and a 42-day horizon", () => {
    const d = full();
    d.sessions = [];
    const p = planTraining(d, date);
    expect(p.phase).toBe("Insufficient Data");
    expect(p.horizon).toHaveLength(42);
  });
  it("missing check-ins do not imply good or poor recovery", () => {
    const d = full();
    expect(planTraining(d, date).phase).toBe("Build");
    expect(planTraining(d, date).observations.join(" ")).toContain("unknown");
    expect(baseline([], date).valid).toBe(false);
  });
  it("baseline excludes today, future, and the 15th prior day; needs seven unique valid days", () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      check(addDays(date, -i - 1)),
    );
    expect(
      baseline(
        [
          ...entries,
          check(date, 5),
          check(addDays(date, -15), 5),
          check(addDays(date, 1), 5),
        ],
        date,
      ),
    ).toMatchObject({ count: 7, valid: true, values: { fatigue: 2 } });
    expect(baseline(entries.slice(0, 6), date).valid).toBe(false);
    expect(baseline([...entries, entries[0]], date).count).toBe(7);
  });
  it("compares fatigue with the athlete baseline", () => {
    const d = full();
    d.checkIns = [
      ...Array.from({ length: 7 }, (_, i) => check(addDays(date, -i - 1))),
      check(date, 4),
    ];
    expect(planTraining(d, date).phase).toBe("Recover");
  });
  it("recent competition without recovery information triggers review, not automatic recovery certification", () => {
    const d = full();
    d.sessions.push({
      ...session("comp", addDays(date, -1)),
      category: "Competition",
    });
    expect(planTraining(d, date).phase).toBe("Recover");
  });
  it("supports rejection and explicit phase overrides", () => {
    const d = full();
    d.tournaments = [tournament("nationals", "A", 6)];
    const s = planTraining(d, date).suggestions[0];
    d.decisions = [
      {
        ...identity("personal"),
        key: s.key,
        status: "dismissed",
        algorithm: "1.0",
        rationale: s.text,
        inputIds: s.inputIds,
      },
    ];
    d.overrides = [
      {
        ...identity("personal"),
        createdAt: date + "T00:00:00Z",
        phase: "Maintain",
        until: addDays(date, 2),
        reason: "Coach-led plan",
      },
    ];
    expect(planTraining(d, date).phase).toBe("Maintain");
    expect(
      planTraining(d, date).suggestions.find((x) => x.key === s.key),
    ).toBeUndefined();
  });
  it("never changes plans and excludes locked plans from adjustments", () => {
    const d = full();
    d.tournaments = [tournament("nationals", "A", 6)];
    const p: Plan = {
      ...identity("personal"),
      date,
      time: "18:00",
      title: "Strength",
      category: "Strength",
      subtype: "",
      duration: 60,
      rpe: 7,
      notes: "",
      status: "planned",
      locked: true,
    };
    d.plans = [p];
    const before = JSON.stringify(d);
    expect(
      planTraining(d, date).suggestions.some((s) => s.planId === p.id),
    ).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("responds to cancellation and postponement", () => {
    const d = full();
    d.tournaments = [tournament("nationals", "A", 6)];
    expect(planTraining(d, date).phase).toBe("Taper");
    d.tournaments[0].startDate = addDays(date, 30);
    d.tournaments[0].endDate = addDays(date, 30);
    expect(planTraining(d, date).phase).toBe("Build");
    d.tournaments = [];
    expect(planTraining(d, date).phase).toBe("Build");
  });
});
describe("validation, backups and isolation", () => {
  it("exports and imports training with details without loss", () => {
    const d = sampleData(date);
    expect(parseBackup(serialize(d)).sessions).toEqual(d.sessions);
    expect(parseBackup(serialize(d)).sets).toEqual(d.sets);
  });
  it("rejects corrupt, future schema, invalid dates, duplicates and load inconsistencies", () => {
    expect(() => parseBackup("bad")).toThrow();
    expect(() =>
      parseBackup('{"app":"AthleteOS","schemaVersion":99}'),
    ).toThrow();
    const d = full();
    d.sessions[0].date = "2026-02-30";
    expect(() => parseBackup(serialize(d))).toThrow();
    const v = full();
    v.sessions.push(v.sessions[0]);
    expect(() => parseBackup(serialize(v))).toThrow();
    expect(
      sessionSchema.safeParse({ ...session("a"), sessionLoad: 0 }).success,
    ).toBe(false);
  });
  it("sample data construction leaves real data alone", () => {
    const personal = full(),
      before = serialize(personal);
    const sample = sampleData(date);
    expect(sample.profile!.id).toBe("sample");
    expect(sample.sessions.every((s) => s.dataset === "sample")).toBe(true);
    expect(JSON.parse(serialize(personal)).sessions).toEqual(
      JSON.parse(before).sessions,
    );
  });
  it("CSV handles quotes, line breaks and spreadsheet formulas", () => {
    const output = csv([
      { notes: '=HYPERLINK("bad")', title: "Line 1\nLine 2", rpe: null },
    ]);
    expect(output).toContain("'=HYPERLINK");
    expect(output).toContain('"Line 1\nLine 2"');
  });
  it("quick and detailed ratings use the same integer/null schema", () => {
    expect(sessionSchema.parse(session("quick")).rpe).toBe(7);
    expect(
      sessionSchema.parse({ ...session("detailed"), rpeInputMode: "detailed" })
        .sessionLoad,
    ).toBe(630);
    expect(
      sessionSchema.parse(session("skip", date, null)).sessionLoad,
    ).toBeNull();
    expect(
      sessionSchema.safeParse({
        ...session("fraction"),
        rpe: 7.5,
        sessionLoad: 675,
      }).success,
    ).toBe(false);
    expect(defaultProfile().defaultRpeMode).toBe("quick");
  });
});

it("an unexpectedly demanding competition prompts recovery review even with a mild check-in", () => {
  const d = full();
  d.sessions.push({
    ...session("demanding", addDays(date, -1)),
    category: "Competition",
    postFatigue: 9,
  });
  d.checkIns = [check(date)];
  expect(planTraining(d, date).phase).toBe("Recover");
});
