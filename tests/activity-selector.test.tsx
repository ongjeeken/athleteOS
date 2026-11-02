import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActivityDaySelector,
  type ActivityContext,
} from "../src/components/activity-day-selector";
import { type WeeklyRule } from "../src/domain/models";
function Harness({
  context = "onboarding",
  initial = [],
}: {
  context?: ActivityContext;
  initial?: WeeklyRule[];
}) {
  const [rules, setRules] = useState(initial),
    [rest, setRest] = useState<number[]>([]),
    [unavailable, setUnavailable] = useState<number[]>([]);
  return (
    <>
      <ActivityDaySelector
        context={context}
        rules={rules}
        restDays={rest}
        unavailableDays={unavailable}
        onChange={(r, a, u) => {
          setRules(r);
          setRest(a);
          setUnavailable(u);
        }}
      />
      <output data-testid="routine">{JSON.stringify(rules)}</output>
    </>
  );
}
const stored = () =>
  JSON.parse(screen.getByTestId("routine").textContent!) as WeeklyRule[];
describe("one activity-by-day selector", () => {
  it.each(["onboarding", "history", "future"] as const)(
    "uses the same interaction in %s context",
    (context) => {
      render(<Harness context={context} />);
      expect(
        screen.getByRole("table", { name: "Activity by weekday" }),
      ).toBeInTheDocument();
      expect(document.querySelector(".activity-day-selector")).toHaveAttribute(
        "data-context",
        context,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Fencing on Monday", exact: true }),
      );
      expect(stored()[0]).toMatchObject({
        category: "Fencing",
        days: [1],
        durationMinutes: null,
      });
      expect(
        screen.getByRole("status", { name: "Weekly routine count" }),
      ).toHaveTextContent("1 session per week");
      expect(
        screen.getByRole("button", { name: "Fencing on Monday", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    },
  );
  it("selects independent same-day activities and applies one duration per category", () => {
    render(<Harness />);
    for (const name of [
      "Fencing on Monday",
      "Fencing on Wednesday",
      "Strength / Gym on Monday",
    ])
      fireEvent.click(screen.getByRole("button", { name, exact: true }));
    fireEvent.change(
      screen.getByLabelText("Typical duration for Fencing (min)"),
      { target: { value: "90" } },
    );
    const r = stored();
    expect(r).toHaveLength(3);
    expect(new Set(r.map((r) => r.id)).size).toBe(3);
    expect(
      r
        .filter((r) => r.category === "Fencing")
        .every((r) => r.durationMinutes === 90),
    ).toBe(true);
    expect(
      r.find((r) => r.category === "Strength")?.durationMinutes,
    ).toBeNull();
    expect(
      screen.getByRole("status", { name: "Weekly routine count" }),
    ).toHaveTextContent("3 sessions per week");
    fireEvent.click(
      screen.getByRole("button", { name: "Fencing on Wednesday", exact: true }),
    );
    expect(stored()).toHaveLength(2);
  });
  it("adds another same-type session without replacing the first", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Fencing on Monday", exact: true }),
    );
    const id = stored()[0].id;
    fireEvent.click(
      screen.getByRole("button", { name: /Another Session.*for Fencing/ }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add another Fencing session",
        exact: true,
      }),
    );
    expect(stored()).toHaveLength(2);
    expect(stored()[0].id).toBe(id);
    expect(stored()[1].id).not.toBe(id);
    expect(
      screen.getByRole("button", { name: "Fencing on Monday", exact: true }),
    ).toHaveTextContent("2");
    expect(
      screen.getByRole("status", { name: "Weekly routine count" }),
    ).toHaveTextContent("2 sessions per week");
  });
  it("preserves custom activity labels and blank duration", () => {
    render(<Harness context="future" />);
    fireEvent.change(screen.getByLabelText("Custom training category"), {
      target: { value: "Pilates" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add activity", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Pilates on Tuesday", exact: true }),
    );
    expect(stored()[0]).toMatchObject({
      category: "Other",
      customActivity: "Pilates",
      title: "Pilates",
      durationMinutes: null,
      days: [2],
    });
  });
  it("does not invent defaults for preloaded mixed-duration sessions or lose their IDs", () => {
    const initial: WeeklyRule[] = [
      {
        id: "am",
        title: "Fencing",
        category: "Fencing",
        durationMinutes: 60,
        days: [1],
        subtype: "",
        time: "",
        timeOfDay: "Morning",
      },
      {
        id: "pm",
        title: "Fencing",
        category: "Fencing",
        durationMinutes: 120,
        days: [1],
        subtype: "",
        time: "",
        timeOfDay: "Evening",
      },
    ];
    render(<Harness initial={initial} context="history" />);
    expect(
      screen.getByLabelText("Typical duration for Fencing (min)"),
    ).toHaveValue(null);
    expect(stored()).toEqual(initial);
    expect(
      screen.getByRole("button", { name: "Fencing on Monday", exact: true }),
    ).toHaveTextContent("2");
  });
  it("keeps the detailed calendar optional and preserves the routine when opened", async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Fencing on Monday", exact: true }),
    );
    const previous = stored();
    expect(
      screen.queryByRole("button", {
        name: "Add session on Monday",
        exact: true,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Advanced weekly calendar editor"));
    expect(
      await screen.findByRole("button", {
        name: "Add session on Monday",
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(stored()).toEqual(previous);
  });
});
