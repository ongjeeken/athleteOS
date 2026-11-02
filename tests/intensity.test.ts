import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/domain/dates";
import type {
  Competition,
  StoredEffort,
  Kind,
  Session,
  TrackerData,
} from "../src/minimal/model";
import {
  changeCompetition,
  recommendIntensities,
  refreshIntensityPlan,
} from "../src/minimal/intensity";
import { observe } from "../src/minimal/observations";
import { changeRoutine, materialize } from "../src/minimal/schedule";
import { readData, saveData, STORAGE_KEY } from "../src/minimal/storage";

const monday = "2026-11-02";
function session(
  date: string,
  kind: Kind = "fencing",
  id = `${date}-${kind}`,
): Session {
  return {
    id,
    date,
    originalDate: date,
    kind,
    status: "planned",
    modified: true,
  };
}
function data(
  sessions: Session[] = [],
  competition?: Competition,
): TrackerData {
  return {
    version: 1,
    startedOn: "2026-10-19",
    templates: [],
    sessions,
    competition,
  };
}
function logged(date: string, effort: StoredEffort = "Hard") {
  return { ...session(date), status: "completed" as const, effort };
}
function level(plan: Map<string, { level: string }>, value: Session) {
  return plan.get(value.id)?.level;
}
beforeEach(() => localStorage.clear());

describe("deterministic session intensity", () => {
  it("provides a useful normal week with spaced hard opportunities and activity-specific meanings, without history", () => {
    const sessions = [
      session(monday),
      session(addDays(monday, 2), "strength"),
      session(addDays(monday, 4), "conditioning"),
      session(addDays(monday, 6), "recovery"),
    ];
    const plan = recommendIntensities(data(sessions), monday);
    expect(sessions.map((s) => level(plan, s))).toEqual([
      "Hard",
      "Hard",
      "Moderate",
      "Light",
    ]);
    expect(plan.get(sessions[0].id)?.focus).toContain("bouts");
    expect(plan.get(sessions[1].id)?.focus).toContain("strength");
    expect(plan.get(sessions[2].id)?.focus).toContain("conditioning");
    expect(
      recommendIntensities(data(sessions.slice().reverse()), monday),
    ).toEqual(plan);
  });
  it("uses a short easing window for a regular event, preserving normal training earlier", () => {
    const sessions = [
      session(monday),
      session(addDays(monday, 2), "strength"),
      session(addDays(monday, 3), "conditioning"),
      session(addDays(monday, 4)),
      session(addDays(monday, 5), "strength"),
    ];
    const plan = recommendIntensities(
      data(sessions, { date: addDays(monday, 5), name: "Club Open" }),
      monday,
    );
    expect(level(plan, sessions[0])).toBe("Hard");
    expect(level(plan, sessions[1])).toBe("Hard");
    expect(level(plan, sessions[2])).toBe("Moderate");
    expect(level(plan, sessions[3])).toBe("Light");
    expect(plan.get(sessions[3].id)?.reason).toContain("Regular competition");
    expect(plan.get(sessions[4].id)?.rule).toBe("competition-day");
  });
  it("makes final priority-event days more cautious without imposing a long taper", () => {
    const sessions = [
      session(monday),
      session(addDays(monday, 1), "strength"),
      session(addDays(monday, 2)),
      session(addDays(monday, 3), "conditioning"),
      session(addDays(monday, 4)),
    ];
    const event: Competition = {
      date: addDays(monday, 5),
      name: "Nationals",
      priority: "priority",
    };
    const plan = recommendIntensities(data(sessions, event), monday);
    expect(sessions.map((s) => level(plan, s))).toEqual([
      "Hard",
      "Light",
      "Moderate",
      "Light",
      "Light",
    ]);
    expect(plan.get(sessions[1].id)?.reason).toContain("Priority competition");
  });
  it("supports closely spaced regular competitions without extending a taper across the entire week", () => {
    const sessions = [
      session("2026-11-01"),
      session(monday),
      session(addDays(monday, 2)),
      session(addDays(monday, 4)),
    ];
    const events = {
      ...data(sessions, { date: "2026-11-07", name: "Open 3" }),
      competitionHistory: [
        { date: "2026-10-24", name: "Open 1" },
        { date: "2026-10-31", name: "Open 2" },
      ],
    };
    const plan = recommendIntensities(events, "2026-11-01");
    expect(level(plan, sessions[0])).toBe("Light");
    expect(level(plan, sessions[1])).toBe("Hard");
    expect(level(plan, sessions[3])).toBe("Light");
  });
  it("accounts for runs across week boundaries and keeps productive moderate work", () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      session(addDays(monday, i)),
    );
    const plan = recommendIntensities(data(sessions), monday);
    expect(level(plan, sessions[0])).toBe("Hard");
    expect(level(plan, sessions[3])).toBe("Light");
    expect(level(plan, sessions[4])).toBe("Moderate");
    const before = [
      session(addDays(monday, -3)),
      session(addDays(monday, -2)),
      session(addDays(monday, -1)),
    ];
    expect(
      recommendIntensities(data([...before, ...sessions]), monday).get(
        sessions[0].id,
      )?.rule,
    ).toBe("consecutive-light");
  });
  it("shares daily demand across double sessions and handles recovery separately", () => {
    const sessions = [
      session(monday),
      session(monday, "strength"),
      session(monday, "recovery"),
    ];
    const plan = recommendIntensities(data(sessions), monday);
    expect(sessions.map((s) => level(plan, s))).toEqual([
      "Moderate",
      "Moderate",
      "Light",
    ]);
    expect(plan.get(sessions[0].id)?.reason).toContain("2 training sessions");
  });
  it("limits hard suggestions in a high-frequency schedule, with no adjacent hard days", () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      session(addDays(monday, i)),
    );
    const plan = recommendIntensities(data(sessions), monday);
    expect([...plan.values()].filter((s) => s.level === "Hard")).toHaveLength(
      1,
    );
    expect(
      [...plan.values()].filter((s) => s.level === "Moderate").length,
    ).toBeGreaterThan(1);
    const alternates = [0, 2, 4, 6].map((i) => session(addDays(monday, i)));
    expect(
      [...recommendIntensities(data(alternates), monday).values()].filter(
        (s) => s.level === "Hard",
      ),
    ).toHaveLength(2);
  });
  it("uses generic guidance for an unspecified activity and stays useful with no historical records", () => {
    const other = session(monday, "other");
    const plan = recommendIntensities(data([other]), monday);
    expect(level(plan, other)).toBe("Moderate");
    expect(plan.get(other.id)?.focus).not.toMatch(/bouts|weights|intervals/);
    expect(recommendIntensities(data(), monday).size).toBe(0);
  });
  it("uses bounded recent reported effort without labeling it fatigue or requiring questionnaires", () => {
    const recent = [logged("2026-10-31"), logged("2026-11-01"), logged(monday)];
    const next = session("2026-11-04");
    const later = session("2026-11-09");
    const plan = recommendIntensities(data([...recent, next, later]), monday);
    expect(plan.get(next.id)?.rule).toBe("recent-effort");
    expect(level(plan, next)).toBe("Moderate");
    expect(plan.get(next.id)?.reason).toContain("do not tell us your recovery");
    expect(level(plan, later)).toBe("Hard");
    expect(
      recommendIntensities(data([recent[0], recent[1], next]), monday).get(
        next.id,
      )?.rule,
    ).not.toBe("recent-effort");
  });
  it("does not count skipped/removed entries as training or as actual-effort feedback", () => {
    const sessions = [
      session(monday),
      { ...session(monday, "strength"), status: "skipped" as const },
      { ...logged("2026-11-01"), removed: true },
    ];
    const plan = recommendIntensities(data(sessions), monday);
    expect(level(plan, sessions[0])).toBe("Hard");
    expect(plan.has(sessions[1].id)).toBe(false);
    expect(plan.has(sessions[2].id)).toBe(false);
  });
  it("respects manual hard plans when allocating other hard suggestions", () => {
    const sessions = [
      { ...session(monday), intensityOverride: "Hard" as const },
      session(addDays(monday, 1)),
      session(addDays(monday, 2)),
      session(addDays(monday, 4)),
    ];
    const plan = recommendIntensities(data(sessions), monday);
    expect(level(plan, sessions[0])).toBe("Hard");
    expect(level(plan, sessions[1])).toBe("Moderate");
    expect(level(plan, sessions[2])).toBe("Moderate");
    expect(level(plan, sessions[3])).toBe("Hard");
  });
});

describe("saved recommendations and plan changes", () => {
  it("keeps variation after months of consecutive training rather than capping the run and making every day light", () => {
    const sessions = Array.from({ length: 45 }, (_, i) =>
      session(addDays(monday, i)),
    );
    const plan = recommendIntensities(data(sessions), addDays(monday, 35));
    const upcoming = sessions
      .filter((s) => s.date >= addDays(monday, 35))
      .map((s) => level(plan, s));
    expect(upcoming).toContain("Moderate");
    expect(upcoming).toContain("Light");
    expect(upcoming.filter((l) => l === "Light").length).toBeLessThan(
      upcoming.length,
    );
  });
  it("updates upcoming recommendations when the competition date or priority changes", () => {
    const gym = session("2026-11-04", "strength");
    const initial = refreshIntensityPlan(
      data([gym], { date: "2026-11-05", name: "Open" }),
      monday,
    );
    expect(initial.sessions[0].recommendation?.level).toBe("Light");
    const moved = refreshIntensityPlan(
      changeCompetition(
        initial,
        { date: "2026-11-07", name: "Open", priority: "regular" },
        monday,
      ),
      monday,
    );
    expect(moved.sessions[0].recommendation?.level).toBe("Hard");
    const priority = refreshIntensityPlan(
      changeCompetition(
        moved,
        { date: "2026-11-07", name: "Open", priority: "priority" },
        monday,
      ),
      monday,
    );
    expect(priority.sessions[0].recommendation?.level).toBe("Light");
    expect(priority.competitionHistory).toBeUndefined();
  });
  it("keeps previous event context when the athlete enters the next competition", () => {
    const initial = data([], { date: "2026-10-31", name: "Open 1" });
    const next = changeCompetition(
      initial,
      { date: "2026-11-07", name: "Open 2" },
      monday,
    );
    expect(next.competitionHistory).toEqual([initial.competition]);
    expect(
      changeCompetition(next, { date: "2026-11-08", name: "Open 2" }, monday)
        .competitionHistory,
    ).toHaveLength(1);
    expect(
      changeCompetition(initial, undefined, monday).competitionHistory,
    ).toBeUndefined();
  });
  it("never overwrites completed or elapsed recommendations or actual effort after plan changes and reload", () => {
    let initial = refreshIntensityPlan(
      data([session(monday), session("2026-11-04")]),
      monday,
    );
    const recorded = initial.sessions[0].recommendation!;
    initial = {
      ...initial,
      sessions: initial.sessions.map((s, i) =>
        i === 0 ? { ...s, status: "completed", effort: "Easy" } : s,
      ),
    };
    const next = refreshIntensityPlan(
      {
        ...initial,
        competition: {
          date: "2026-11-03",
          name: "Priority",
          priority: "priority",
        },
      },
      "2026-11-03",
    );
    expect(next.sessions[0]).toMatchObject({
      status: "completed",
      effort: "Easy",
      recommendation: recorded,
    });
    saveData(next);
    expect(readData()?.sessions[0].recommendation).toEqual(recorded);
    expect(readData()?.sessions[0].effort).toBe("Easy");
    const elapsed = refreshIntensityPlan(data([session(monday)]), monday);
    expect(
      refreshIntensityPlan(
        { ...elapsed, competition: { date: "2026-11-03", name: "Open" } },
        "2026-11-03",
      ).sessions[0].recommendation,
    ).toEqual(elapsed.sessions[0].recommendation);
  });
  it("reads existing v1 data without loss and does not invent recommendations for old completed sessions", () => {
    const old = data([logged("2026-10-30", "Normal"), session(monday)]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    const migrated = refreshIntensityPlan(readData()!, monday);
    expect(migrated.sessions[0]).toEqual(old.sessions[0]);
    expect(migrated.sessions[0].recommendation).toBeUndefined();
    expect(migrated.sessions[1].recommendation).toBeDefined();
    saveData(migrated);
    expect(readData()?.sessions[0]).toEqual(old.sessions[0]);
  });
  it("keeps suggested intensity, the athlete's override and actual effort as separate persisted values", () => {
    const initial = refreshIntensityPlan(data([session(monday)]), monday);
    const selected = {
      ...initial,
      sessions: initial.sessions.map((s) => ({
        ...s,
        intensityOverride: "Moderate" as const,
        status: "completed" as const,
        effort: "Easy" as const,
      })),
    };
    const next = refreshIntensityPlan(selected, monday);
    saveData(next);
    expect(readData()?.sessions[0]).toMatchObject({
      recommendation: { level: "Hard" },
      intensityOverride: "Moderate",
      effort: "Easy",
    });
  });
  it("refreshes the plan after routine edits while preserving historical snapshots and all existing dates", () => {
    const first = refreshIntensityPlan(
      materialize(
        { ...data(), templates: [{ id: "f", day: 0, kind: "fencing" }] },
        monday,
      ),
      monday,
    );
    const before = JSON.stringify(first);
    const next = refreshIntensityPlan(
      changeRoutine(
        first,
        [
          { id: "f", day: 0, kind: "fencing" },
          { id: "g", day: 0, kind: "strength" },
        ],
        monday,
      ),
      monday,
    );
    expect(
      next.sessions.find((s) => s.id === `f@${monday}`)?.recommendation?.level,
    ).toBe("Moderate");
    expect(
      first.sessions.every(
        (s) => next.sessions.find((n) => n.id === s.id)?.date === s.date,
      ),
    ).toBe(true);
    expect(JSON.stringify(first)).toBe(before);
    expect(refreshIntensityPlan(next, monday)).toBe(next);
  });
  it("explains a single weekly strategy without recommending a schedule rearrangement", () => {
    const plan = refreshIntensityPlan(
      data([session(monday), session(monday, "strength")]),
      monday,
    );
    const summary = observe(plan, monday, monday);
    expect(summary.title).toBe("Keep your days. Vary the demand.");
    expect(JSON.stringify(summary)).not.toMatch(
      /spreading|reschedul|cancel|move a session/i,
    );
    expect(observe(data(), monday, monday).text).toContain(
      "Light, Moderate or Hard",
    );
  });
  it("explains the displayed Monday event and subsequent training without inventing pre-event days in that view", () => {
    const plan = refreshIntensityPlan(
      data([session(monday), session(addDays(monday, 2))], {
        date: monday,
        name: "Open",
      }),
      monday,
    );
    const summary = observe(plan, monday, monday);
    expect(summary.title).toBe("Light extras on competition day");
    expect(summary.text).toContain("competition day is suggested Light");
    expect(summary.text).toContain("afterward");
    expect(summary.text).not.toMatch(/earlier|day before|two days before/);
    const after = refreshIntensityPlan(
      data([session(monday), session(addDays(monday, 2))], {
        date: addDays(monday, -1),
        name: "Open",
      }),
      monday,
    );
    expect(observe(after, monday, monday).title).toBe(
      "A lighter start after competition",
    );
  });
});
