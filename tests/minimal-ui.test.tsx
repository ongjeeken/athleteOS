import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import Tracker from "../src/minimal/Tracker";
import { readData, saveData } from "../src/minimal/storage";
import { materialize } from "../src/minimal/schedule";
import type { TrackerData } from "../src/minimal/model";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
function seed() {
  const data: TrackerData = {
    version: 1,
    startedOn: "2026-10-26",
    templates: [{ id: "f", day: 6, kind: "fencing" }],
    sessions: [],
  };
  saveData(materialize(data, data.startedOn));
}

describe("minimal onboarding-to-logging workflow", () => {
  it("shows combined daily demand above session guidance and updates it when an occurrence is skipped", () => {
    const initial: TrackerData = {
      version: 1,
      startedOn: "2026-10-26",
      templates: [
        { id: "f", day: 6, kind: "fencing" },
        { id: "g", day: 6, kind: "strength" },
      ],
      sessions: [],
    };
    const prepared = materialize(initial, initial.startedOn);
    prepared.sessions = prepared.sessions.map((s) => ({
      ...s,
      intensityOverride: "Moderate",
    }));
    saveData(prepared);
    const view = render(<Tracker />);
    const panel = screen.getByRole("region", { name: "Today's daily demand" });
    expect(panel).toHaveTextContent("Hard");
    expect(panel).toHaveTextContent("together");
    const gym = screen.getByRole("article", { name: "Gym / strength session" });
    fireEvent.click(
      within(gym).getByRole("button", { name: "Skip session", exact: true }),
    );
    expect(panel).toHaveTextContent("Moderate starting point");
    view.unmount();
    render(<Tracker />);
    expect(
      screen.getByRole("region", { name: "Today's daily demand" }),
    ).toHaveTextContent("Moderate starting point");
    click("Week");
    expect(
      screen.getByRole("button", {
        name: /Sunday 1 November, daily demand Moderate/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Tuesday 27 October, daily demand Rest/,
      }),
    ).toHaveTextContent("Rest");
  });
  it("hides legacy duration everywhere, retains it through edits, and presents old actual effort on the current scale", () => {
    seed();
    const old = readData()!;
    old.sessions[0] = {
      ...old.sessions[0],
      status: "completed",
      effort: "Normal",
      duration: 90,
    };
    saveData(old);
    render(<Tracker />);
    expect(
      screen.getByText(/Completed · Actual: Moderate/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/90 min/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Easy", exact: true }),
    ).not.toBeInTheDocument();
    click("Add details");
    expect(screen.queryByLabelText(/duration/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Notes/), {
      target: { value: "Retained history" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save changes" }).closest("form")!,
    );
    expect(readData()?.sessions[0]).toMatchObject({
      duration: 90,
      effort: "Normal",
      notes: "Retained history",
    });
    click("Change effort");
    expect(
      screen.getByRole("button", { name: "Light", exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Moderate", exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hard", exact: true }),
    ).toBeInTheDocument();
  });
  it("opens the next relevant week when setup happens after this week's routine days", () => {
    render(<Tracker />);
    click("Add Fencing on Monday");
    click("Continue");
    click("Skip for now");
    expect(
      screen.getByRole("heading", { name: "Your intensity plan is ready." }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("article", { name: "Fencing session" }),
    ).toHaveLength(1);
    expect(screen.getByText("Recommended:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Monday 2 November.*Fencing planned Hard/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No suggestion recorded for this session."),
    ).not.toBeInTheDocument();
    expect(
      readData()?.sessions.find((s) => s.date === "2026-10-26")?.recommendation,
    ).toBeUndefined();
    expect(
      readData()?.sessions.find((s) => s.date === "2026-11-02")?.recommendation,
    ).toBeDefined();
  });
  it("uses exactly two stages, supports double sessions, skips competition and opens a real personalized week", () => {
    const view = render(<Tracker />);
    click("Add Fencing on Sunday");
    click("Gym / strength");
    click("Add Gym / strength on Sunday");
    click("Continue");
    expect(screen.getByLabelText("Step 2 of 2")).toBeInTheDocument();
    click("Skip for now");
    expect(
      screen.getByRole("heading", { name: "Your intensity plan is ready." }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("region", { name: "Weekly intensity strategy" }),
    ).toHaveLength(1);
    expect(readData()?.templates).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: /Sunday 1 November.*Fencing planned Moderate.*Gym \/ strength planned Moderate/,
      }),
    ).toBeInTheDocument();
    expect(readData()?.competition).toBeUndefined();
    click("Go to today");
    const fencing = screen.getByRole("article", { name: "Fencing session" });
    fireEvent.click(
      within(fencing).getByRole("button", { name: "Moderate", exact: true }),
    );
    expect(
      within(fencing).getByText(/Completed · Actual: Moderate/),
    ).toBeInTheDocument();
    expect(readData()?.sessions.find((s) => s.kind === "fencing")?.effort).toBe(
      "Moderate",
    );
    view.unmount();
    render(<Tracker />);
    expect(
      screen.getByRole("heading", { name: "Today’s training." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Completed · Actual: Moderate/),
    ).toBeInTheDocument();
  });
  it("accepts an optional competition and restores unfinished setup", () => {
    const view = render(<Tracker />);
    click("Add Fencing on Saturday");
    click("Continue");
    fireEvent.change(screen.getByLabelText("Competition date"), {
      target: { value: "2026-11-08" },
    });
    fireEvent.change(screen.getByLabelText(/Competition name/), {
      target: { value: "Local Open" },
    });
    view.unmount();
    render(<Tracker />);
    expect(screen.getByLabelText("Competition date")).toHaveValue("2026-11-08");
    fireEvent.submit(
      screen.getByRole("button", { name: "See my week" }).closest("form")!,
    );
    expect(readData()?.competition?.name).toBe("Local Open");
    expect(readData()?.templates[0].day).toBe(5);
  });
  it("undoes accidental effort, supports optional details, skips and adds one-off sessions", () => {
    seed();
    render(<Tracker />);
    click("Hard");
    click("Undo");
    expect(readData()?.sessions[0].status).toBe("planned");
    click("Light");
    click("Add details");
    expect(screen.queryByLabelText(/duration/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Notes/), {
      target: { value: "Footwork and technical bouts" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save changes" }).closest("form")!,
    );
    expect(readData()?.sessions[0]).toMatchObject({
      effort: "Light",
      notes: "Footwork and technical bouts",
    });
    click("Undo");
    click("Skip session");
    expect(readData()?.sessions[0].status).toBe("skipped");
    expect(readData()?.templates).toHaveLength(1);
    click("Add an unscheduled session");
    click("Recovery / mobility");
    fireEvent.submit(
      screen.getByRole("heading", { name: "Add a session" }).closest("form")!,
    );
    expect(
      readData()?.sessions.filter((s) => s.date === "2026-11-01"),
    ).toHaveLength(2);
    const extra = readData()?.sessions.find((s) => s.kind === "recovery");
    expect(extra?.kind).toBe("recovery");
    expect(extra?.templateId).toBeUndefined();
  });
  it("reschedules one occurrence while future weeks still follow the routine", () => {
    seed();
    render(<Tracker />);
    click("Add details");
    fireEvent.change(screen.getByLabelText("Date", { exact: true }), {
      target: { value: "2026-11-02" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save changes" }).closest("form")!,
    );
    expect(
      screen.getByText(/No sessions planned for today/),
    ).toBeInTheDocument();
    click("Week");
    click("Next week");
    expect(
      readData()?.sessions.find((s) => s.id === "f@2026-11-01")?.date,
    ).toBe("2026-11-02");
    expect(
      readData()?.sessions.find((s) => s.id === "f@2026-11-08")?.date,
    ).toBe("2026-11-08");
    expect(
      screen.getAllByRole("article", { name: "Fencing session" }),
    ).toHaveLength(2);
    click("Previous week");
    click("Previous week");
    expect(screen.getByText("20 Oct", { exact: true })).toBeInTheDocument();
  });
  it("reports write failure without presenting the session as saved", () => {
    seed();
    render(<Tracker />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    click("Moderate");
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    expect(
      screen.getByRole("button", { name: "Moderate", exact: true }),
    ).toBeInTheDocument();
    expect(readData()?.sessions[0].status).toBe("planned");
  });
  it("allows an intensity override while actual effort stays independent and both survive reload", () => {
    seed();
    const view = render(<Tracker />);
    const recorded = readData()?.sessions[0].recommendation;
    expect(recorded?.level).toBe("Hard");
    fireEvent.click(
      screen.getByText("Why / adjust intensity", { exact: true }),
    );
    click("Plan Light");
    expect(screen.getByText("Your plan:")).toBeInTheDocument();
    click("Hard");
    expect(readData()?.sessions[0]).toMatchObject({
      recommendation: recorded,
      intensityOverride: "Light",
      effort: "Hard",
      status: "completed",
    });
    view.unmount();
    render(<Tracker />);
    expect(screen.getByText(/Completed · Actual: Hard/)).toBeInTheDocument();
    expect(screen.getByText("Your plan:")).toBeInTheDocument();
    expect(screen.getByText("Suggested: Hard")).toBeInTheDocument();
  });
  it("edits competition priority and refreshes upcoming guidance without changing a completed suggestion", () => {
    seed();
    render(<Tracker />);
    click("Moderate");
    const recorded = readData()?.sessions[0].recommendation;
    click("Add competition");
    expect(
      screen.getByRole("radio", { name: "Regular competition" }),
    ).toBeChecked();
    fireEvent.change(screen.getByLabelText("Competition date"), {
      target: { value: "2026-11-09" },
    });
    fireEvent.click(
      screen.getByRole("radio", { name: "Priority competition" }),
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Save competition" }).closest("form")!,
    );
    expect(readData()?.competition?.priority).toBe("priority");
    expect(
      readData()?.sessions.find((s) => s.date === "2026-11-08")?.recommendation
        ?.level,
    ).toBe("Light");
    expect(readData()?.sessions[0].recommendation).toEqual(recorded);
    expect(readData()?.sessions[0].effort).toBe("Moderate");
  });
});
