export const quickEfforts = [
  { value: 1, label: "Very Easy", description: "Barely any effort" },
  { value: 2, label: "Easy", description: "Comfortable throughout" },
  { value: 3, label: "Moderate", description: "Working, but in control" },
  { value: 5, label: "Hard", description: "Challenging to sustain" },
  { value: 7, label: "Very Hard", description: "Pushing close to your limit" },
  { value: 10, label: "Maximal", description: "Your absolute hardest" },
];
const anchors = [
  "Rest / no effort",
  "Very easy",
  "Easy",
  "Moderate",
  "Somewhat hard",
  "Hard",
  "Hard to very hard",
  "Very hard",
  "Extremely hard",
  "Near maximal",
  "Maximal",
];
export function RpeInput({
  value,
  mode,
  onChange,
  onModeChange,
}: {
  value: number | null;
  mode: "quick" | "detailed";
  onChange: (value: number | null) => void;
  onModeChange: (mode: "quick" | "detailed") => void;
}) {
  function navigateChoices(
    event: KeyboardEvent<HTMLDivElement>,
    values: number[],
  ) {
    if (
      ![
        "ArrowRight",
        "ArrowLeft",
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? values.length - 1
          : (current +
              (event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : -1) +
              values.length) %
            values.length;
    event.preventDefault();
    onChange(values[next]);
    buttons[next].focus();
  }
  return (
    <fieldset className="rpe-input">
      <legend>How hard was your entire session?</legend>
      {mode === "quick" ? (
        <>
          <div
            className="rpe-choices"
            role="radiogroup"
            aria-label="Session effort"
            onKeyDown={(event) =>
              navigateChoices(
                event,
                quickEfforts.map((e) => e.value),
              )
            }
          >
            {quickEfforts.map((e) => (
              <button
                type="button"
                role="radio"
                aria-label={`${e.label} — ${e.description}`}
                aria-checked={value === e.value}
                tabIndex={
                  value === e.value ||
                  (!quickEfforts.some((e) => e.value === value) &&
                    e.value === 1)
                    ? 0
                    : -1
                }
                key={e.value}
                className={value === e.value ? "selected" : ""}
                onClick={() => onChange(e.value)}
              >
                <strong>{e.label}</strong>
                <small>{e.description}</small>
              </button>
            ))}
          </div>
          {value !== null && !quickEfforts.some((e) => e.value === value) && (
            <p className="helper">
              Your exact rating is preserved. Choose an effort to change it.
            </p>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => onModeChange("detailed")}
          >
            Use detailed RPE (0–10)
          </button>
        </>
      ) : (
        <>
          <div
            className="detailed-rpe"
            role="radiogroup"
            aria-label="Detailed session RPE"
            onKeyDown={(event) =>
              navigateChoices(
                event,
                anchors.map((_, i) => i),
              )
            }
          >
            {anchors.map((label, i) => (
              <button
                type="button"
                key={i}
                role="radio"
                aria-label={`${i} — ${label}`}
                aria-checked={value === i}
                tabIndex={value === i || (value === null && i === 0) ? 0 : -1}
                className={value === i ? "selected" : ""}
                onClick={() => onChange(i)}
              >
                <strong>{i}</strong>
                <small>{label}</small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onModeChange("quick")}
          >
            Return to Quick Mode
          </button>
        </>
      )}
      <div className="rpe-footer">
        <span>
          {value === null
            ? "RPE not recorded"
            : mode === "detailed"
              ? `Selected: ${value} — ${anchors[value]}`
              : `Selected: ${quickEfforts.find((e) => e.value === value)?.label ?? "exact effort rating"}`}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(null)}
        >
          Skip RPE
        </button>
      </div>
    </fieldset>
  );
}
import type { KeyboardEvent } from "react";
