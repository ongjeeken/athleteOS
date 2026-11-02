import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { RpeInput, quickEfforts } from "../src/components/rpe";
import { sessionLoad } from "../src/domain/analytics";
function Harness({
  initial = null,
  mode = "quick",
}: {
  initial?: number | null;
  mode?: "quick" | "detailed";
}) {
  const [value, setValue] = useState(initial),
    [current, setCurrent] = useState(mode);
  return (
    <>
      <RpeInput
        value={value}
        mode={current}
        onChange={setValue}
        onModeChange={setCurrent}
      />
      <output data-testid="stored">
        {JSON.stringify({
          rpe: value,
          rpeInputMode: current,
          sessionLoad: sessionLoad(90, value),
        })}
      </output>
    </>
  );
}
describe("two-mode RPE interaction", () => {
  it("defaults to six descriptive choices without a preselected effort or slider", () => {
    render(<Harness />);
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(
      screen
        .getAllByRole("radio")
        .every((r) => r.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByTestId("stored")).toHaveTextContent('"rpe":null');
    quickEfforts.forEach((e) =>
      expect(screen.getByText(e.description)).toBeInTheDocument(),
    );
  });
  it("one tap stores the corresponding integer and computes load", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /Very Hard/ }));
    expect(screen.getByTestId("stored")).toHaveTextContent('"rpe":7');
    expect(screen.getByTestId("stored")).toHaveTextContent('"sessionLoad":630');
  });
  it("supports every quick mapping", () => {
    render(<Harness />);
    quickEfforts.forEach((e) => {
      fireEvent.click(
        screen.getByRole("radio", { name: new RegExp("^" + e.label + " ") }),
      );
      expect(screen.getByTestId("stored")).toHaveTextContent(
        `"rpe":${e.value},`,
      );
    });
  });
  it("switching modes preserves selected effort until deliberately changed", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /Very Hard/ }));
    fireEvent.click(screen.getByText("Use detailed RPE (0–10)"));
    expect(screen.getAllByRole("radio")).toHaveLength(11);
    expect(
      screen.getByRole("radio", { name: "7 — Very hard" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "8 — Extremely hard" }));
    fireEvent.click(screen.getByText("Return to Quick Mode"));
    expect(screen.getByTestId("stored")).toHaveTextContent('"rpe":8');
    expect(screen.getByText(/exact rating is preserved/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Use detailed RPE (0–10)"));
    expect(
      screen.getByRole("radio", { name: "8 — Extremely hard" }),
    ).toHaveAttribute("aria-checked", "true");
  });
  it("allows skipping effort and distinguishes deliberate zero", () => {
    render(<Harness mode="detailed" />);
    fireEvent.click(
      screen.getByRole("radio", { name: "0 — Rest / no effort" }),
    );
    expect(screen.getByTestId("stored")).toHaveTextContent('"sessionLoad":0');
    fireEvent.click(screen.getByText("Skip RPE"));
    expect(screen.getByTestId("stored")).toHaveTextContent('"rpe":null');
    expect(screen.getByTestId("stored")).toHaveTextContent(
      '"sessionLoad":null',
    );
  });
  it("honors detailed preference while allowing a temporary switch", () => {
    render(<Harness mode="detailed" />);
    expect(screen.getAllByRole("radio")).toHaveLength(11);
    fireEvent.click(screen.getByText("Return to Quick Mode"));
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByTestId("stored")).toHaveTextContent(
      '"rpeInputMode":"quick"',
    );
  });
});

it("supports arrow-key selection without selecting anything merely on focus", () => {
  render(<Harness />);
  const first = screen.getByRole("radio", { name: /^Very Easy / });
  first.focus();
  expect(screen.getByTestId("stored")).toHaveTextContent('"rpe":null');
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(screen.getByRole("radio", { name: /^Easy / })).toHaveFocus();
  expect(screen.getByTestId("stored")).toHaveTextContent('"rpe":2');
  fireEvent.keyDown(screen.getByRole("radio", { name: /^Easy / }), {
    key: "End",
  });
  expect(screen.getByTestId("stored")).toHaveTextContent('"rpe":10');
});
