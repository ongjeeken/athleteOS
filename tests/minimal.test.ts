import { beforeEach, describe, expect, it } from "vitest";
import { addDays, today, weekStart } from "../src/domain/dates";
import type { TrackerData } from "../src/minimal/model";
import {
  changeRoutine,
  materialize,
  openWeek,
  sessionsOn,
} from "../src/minimal/schedule";
import { readData, saveData, STORAGE_KEY } from "../src/minimal/storage";

const start = "2026-10-26";
function empty(): TrackerData {
  return { version: 1, startedOn: start, templates: [], sessions: [] };
}
function routine(): TrackerData {
  return {
    ...empty(),
    templates: [
      { id: "fence", day: 0, kind: "fencing" },
      { id: "gym", day: 0, kind: "strength" },
      { id: "fence2", day: 2, kind: "fencing" },
    ],
  };
}
beforeEach(() => localStorage.clear());

describe("minimal tracker calendar and exceptions", () => {
  it("generates independent same-day sessions and stable IDs without duplicates", () => {
    const once = materialize(routine(), start);
    const twice = materialize(once, start);
    expect(sessionsOn(twice, start)).toHaveLength(2);
    expect(twice.sessions.map((s) => s.id)).toEqual(
      once.sessions.map((s) => s.id),
    );
    expect(twice.sessions).toHaveLength(3);
  });
  it("retains logs, skips, moves and removed-occurrence tombstones after regeneration", () => {
    let data = materialize(routine(), start);
    data = {
      ...data,
      sessions: data.sessions.map((s) =>
        s.templateId === "fence"
          ? { ...s, status: "completed", effort: "Hard", modified: true }
          : s.templateId === "gym"
            ? { ...s, date: addDays(start, 1), modified: true }
            : { ...s, removed: true, modified: true },
      ),
    };
    expect(materialize(data, start).sessions).toEqual(data.sessions);
    const skipped = {
      ...data,
      sessions: data.sessions.map((s) =>
        s.templateId === "gym" ? { ...s, status: "skipped" as const } : s,
      ),
    };
    expect(materialize(skipped, start).sessions).toEqual(skipped.sessions);
    expect(sessionsOn(data, start)).toHaveLength(1);
  });
  it("routine edits freeze unvisited past dates and preserve logged and modified future dates", () => {
    let data = openWeek(routine(), "2026-11-09", "2026-10-26");
    data = {
      ...data,
      sessions: data.sessions.map((s) =>
        s.id === "gym@2026-11-09"
          ? { ...s, date: "2026-11-10", modified: true }
          : s.id === "fence@2026-11-09"
            ? { ...s, status: "completed", effort: "Easy", modified: true }
            : s,
      ),
    };
    data.sessions.push({
      id: "one-off",
      date: "2026-11-11",
      originalDate: "2026-11-11",
      kind: "conditioning",
      status: "planned",
      modified: true,
    });
    const next = changeRoutine(data, [], "2026-11-04");
    expect(sessionsOn(next, "2026-11-02")).toHaveLength(2);
    expect(sessionsOn(next, "2026-11-09")[0].effort).toBe("Easy");
    expect(sessionsOn(next, "2026-11-10")[0].id).toBe("gym@2026-11-09");
    expect(next.sessions.some((s) => s.id === "one-off")).toBe(true);
    expect(next.sessions.some((s) => s.id === "fence2@2026-11-11")).toBe(false);
  });
  it("routine changes cannot recreate a deleted or skipped future occurrence", () => {
    const data = materialize(routine(), start);
    const removed = {
      ...data,
      sessions: data.sessions.map((s) => ({
        ...s,
        removed: true,
        modified: true,
      })),
    };
    expect(
      changeRoutine(removed, removed.templates, start).sessions.every(
        (s) => s.removed,
      ),
    ).toBe(true);
  });
  it("new routine entries start today and never rewrite an elapsed day", () => {
    const next = changeRoutine(
      materialize(routine(), start),
      [{ id: "new", day: 0, kind: "other" }],
      "2026-10-29",
    );
    expect(sessionsOn(next, start).map((s) => s.kind)).toEqual([
      "fencing",
      "strength",
    ]);
    expect(
      sessionsOn(materialize(next, "2026-11-02"), "2026-11-02")[0].kind,
    ).toBe("other");
  });
  it("uses calendar dates through leap days, year boundaries, DST and time zones", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(today("Asia/Singapore", new Date("2026-11-01T16:30:00Z"))).toBe(
      "2026-11-02",
    );
    expect(today("America/New_York", new Date("2026-11-01T16:30:00Z"))).toBe(
      "2026-11-01",
    );
    const data = materialize(
      {
        ...empty(),
        startedOn: "2026-12-28",
        templates: [{ id: "a", day: 0, kind: "fencing" }],
      },
      "2026-12-28",
      "2027-01-10",
    );
    expect(data.sessions.map((s) => s.date)).toEqual([
      "2026-12-28",
      "2027-01-04",
    ]);
  });
});

describe("browser persistence", () => {
  it("starts empty, round-trips complete session details and leaves legacy storage alone", () => {
    expect(readData()).toBeNull();
    localStorage.setItem("athleteos-dataset", "personal");
    const data = materialize(routine(), start);
    data.sessions[0] = {
      ...data.sessions[0],
      status: "completed",
      effort: "Normal",
      duration: 75,
      notes: "Technical work",
      modified: true,
    };
    saveData(data);
    expect(readData()).toEqual(data);
    expect(localStorage.getItem("athleteos-dataset")).toBe("personal");
  });
  it("rejects invalid saved data without removing it", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 42 }));
    expect(() => readData()).toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toContain("42");
  });
  it("rejects impossible calendar dates, duplicate IDs and completed sessions without effort", () => {
    const data = materialize(routine(), start);
    expect(() => saveData({ ...data, startedOn: "2026-02-30" })).toThrow();
    expect(() =>
      saveData({ ...data, sessions: [data.sessions[0], data.sessions[0]] }),
    ).toThrow();
    expect(() =>
      saveData({
        ...data,
        sessions: [{ ...data.sessions[0], status: "completed" }],
      }),
    ).toThrow();
  });
});
