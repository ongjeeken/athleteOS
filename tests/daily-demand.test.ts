import { describe, expect, it } from "vitest";
import { combineDailyDemand, dailyDemand } from "../src/minimal/daily-demand";
import { effortIntensity } from "../src/minimal/model";
import type {
  Intensity,
  Kind,
  Session,
  TrackerData,
} from "../src/minimal/model";
import { readData, saveData } from "../src/minimal/storage";
import { recommendIntensities } from "../src/minimal/intensity";

const date = "2026-11-02";
function session(
  kind: Kind,
  level: Intensity,
  id = crypto.randomUUID(),
): Session {
  return {
    id,
    date,
    originalDate: date,
    kind,
    status: "planned",
    modified: false,
    recommendation: {
      level,
      reason: "Saved suggestion",
      focus: "Activity focus",
      rule: "test",
      generatedOn: date,
      engineVersion: 1,
    },
  };
}
const data = (sessions: Session[]): TrackerData => ({
  version: 1,
  startedOn: date,
  templates: [],
  sessions,
});

describe("qualitative daily demand", () => {
  it.each([
    { kinds: [] as Kind[], levels: [] as Intensity[], expected: "Rest" },
    { kinds: ["fencing"], levels: ["Light"], expected: "Light" },
    { kinds: ["strength"], levels: ["Moderate"], expected: "Moderate" },
    { kinds: ["conditioning"], levels: ["Hard"], expected: "Hard" },
    {
      kinds: ["fencing", "strength"],
      levels: ["Moderate", "Moderate"],
      expected: "Hard",
    },
    {
      kinds: ["fencing", "conditioning"],
      levels: ["Light", "Light"],
      expected: "Light",
    },
    {
      kinds: ["fencing", "strength", "conditioning"],
      levels: ["Light", "Light", "Light"],
      expected: "Moderate",
    },
    {
      kinds: ["fencing", "strength", "conditioning"],
      levels: ["Moderate", "Light", "Light"],
      expected: "Hard",
    },
    {
      kinds: ["fencing", "strength"],
      levels: ["Moderate", "Light"],
      expected: "Moderate",
    },
    {
      kinds: ["recovery", "recovery", "recovery"],
      levels: ["Light", "Light", "Light"],
      expected: "Light",
    },
    {
      kinds: ["fencing", "recovery", "recovery"],
      levels: ["Moderate", "Light", "Light"],
      expected: "Moderate",
    },
    {
      kinds: ["fencing", "recovery", "recovery"],
      levels: ["Light", "Light", "Light"],
      expected: "Light",
    },
  ])("$kinds at $levels produces $expected", ({ kinds, levels, expected }) => {
    expect(
      combineDailyDemand(
        kinds.map((kind, i) => session(kind as Kind, levels[i] as Intensity)),
      ).level,
    ).toBe(expected);
  });
  it("considers combined demand rather than choosing the highest session intensity", () => {
    const result = combineDailyDemand([
      session("fencing", "Moderate"),
      session("strength", "Moderate"),
    ]);
    expect(result.level).toBe("Hard");
    expect(result.reason).toContain("together");
    expect(result).not.toHaveProperty("score");
  });
  it("counts independent same-type sessions and excludes skipped or removed occurrences", () => {
    const fence = session("fencing", "Moderate");
    const second = session("fencing", "Moderate");
    expect(combineDailyDemand([fence, second]).level).toBe("Hard");
    expect(
      combineDailyDemand([fence, { ...second, status: "skipped" }]).level,
    ).toBe("Moderate");
    expect(
      combineDailyDemand([
        { ...fence, removed: true },
        { ...second, status: "skipped" },
      ]).level,
    ).toBe("Rest");
  });
  it("retains completed sessions in the planned day without using their actual effort", () => {
    const sessions = [
      session("fencing", "Moderate"),
      session("strength", "Moderate"),
    ];
    const logged = sessions.map((s) => ({
      ...s,
      status: "completed" as const,
      effort: "Light" as const,
    }));
    expect(combineDailyDemand(logged)).toEqual(combineDailyDemand(sessions));
  });
  it("reflects explicit plan overrides and does not escalate demand from gentle recovery", () => {
    const sessions = [
      session("fencing", "Light"),
      session("recovery", "Light"),
    ];
    expect(combineDailyDemand(sessions).level).toBe("Light");
    expect(
      combineDailyDemand([
        { ...sessions[0], intensityOverride: "Hard" },
        sessions[1],
      ]).level,
    ).toBe("Hard");
    expect(
      combineDailyDemand([
        { ...sessions[0], intensityOverride: "Moderate" },
        sessions[1],
      ]).level,
    ).toBe("Moderate");
  });
  it("makes an explicit Hard recovery override visible without counting mobility sessions like demanding training", () => {
    const mobility = session("recovery", "Light");
    expect(combineDailyDemand([mobility, mobility, mobility]).level).toBe(
      "Light",
    );
    expect(
      combineDailyDemand([{ ...mobility, intensityOverride: "Hard" }]).level,
    ).toBe("Hard");
  });
  it("uses only the selected day and updates when a session moves", () => {
    const sessions = [
      session("fencing", "Moderate"),
      session("strength", "Moderate"),
    ];
    expect(dailyDemand(data(sessions), date).level).toBe("Hard");
    const moved = { ...sessions[1], date: "2026-11-03" };
    expect(dailyDemand(data([sessions[0], moved]), date).level).toBe(
      "Moderate",
    );
    expect(dailyDemand(data([sessions[0], moved]), "2026-11-04").level).toBe(
      "Rest",
    );
  });
  it("marks competition day as a provisional Hard event day even if extras are Light", () => {
    const event = {
      ...data([session("fencing", "Light")]),
      competition: { date, name: "Open" },
    };
    expect(dailyDemand(event, date).rule).toBe("competition");
    expect(dailyDemand({ ...event, sessions: [] }, date).level).toBe("Hard");
  });
  it("uses a disclosed starting point for missing old suggestions without modifying history", () => {
    const old = {
      ...session("fencing", "Light"),
      recommendation: undefined,
      status: "completed" as const,
      effort: "Easy" as const,
    };
    const before = JSON.stringify(old);
    const result = combineDailyDemand([old]);
    expect(result.level).toBe("Moderate");
    expect(result.reason).toContain("saved suggestion is missing");
    expect(JSON.stringify(old)).toBe(before);
  });
  it("never uses duration for daily or session recommendations and preserves legacy values", () => {
    const sessions = [
      session("fencing", "Moderate"),
      session("strength", "Moderate"),
    ];
    const legacy = sessions.map((s, i) => ({ ...s, duration: i ? 1440 : 1 }));
    expect(combineDailyDemand(legacy)).toEqual(combineDailyDemand(sessions));
    expect(recommendIntensities(data(legacy), date)).toEqual(
      recommendIntensities(data(sessions), date),
    );
    saveData(data(legacy));
    expect(readData()?.sessions.map((s) => s.duration)).toEqual([1, 1440]);
  });
  it("keeps legacy effort values intact and displays the single current scale", () => {
    const legacy = {
      ...session("fencing", "Light"),
      status: "completed" as const,
      effort: "Normal" as const,
      duration: 90,
    };
    saveData(data([legacy]));
    const record = readData()!.sessions[0];
    expect(record.effort).toBe("Normal");
    expect(effortIntensity(record.effort)).toBe("Moderate");
    expect(effortIntensity("Easy")).toBe("Light");
    expect(effortIntensity("Hard")).toBe("Hard");
    expect(record.duration).toBe(90);
  });
});
