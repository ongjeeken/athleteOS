import { useState } from "react";
import { Check, Plus, SlidersHorizontal, X } from "lucide-react";
import { type WeeklyRule } from "../domain/models";
import {
  activityKey,
  anotherActivitySession,
  changeRuleOccurrence,
  defaultActivities,
  emptyActivityDefaults,
  routineActivities,
  routineSummary,
  toggleActivityDay,
  type Activity,
  type ActivityDefaults,
} from "../domain/routine";
import { WeeklyEditor, weekdayNames } from "./weekly-editor";
import { CategoryIcon, Field } from "./ui";
const days = [1, 2, 3, 4, 5, 6, 0];
export type ActivityContext = "onboarding" | "history" | "future";
export function ActivityDaySelector({
  rules,
  restDays,
  unavailableDays,
  onChange,
  context,
  onUseUsual,
  onUseRecent,
}: {
  rules: WeeklyRule[];
  restDays: number[];
  unavailableDays: number[];
  onChange: (
    rules: WeeklyRule[],
    rest: number[],
    unavailable: number[],
  ) => void;
  context: ActivityContext;
  onUseUsual?: () => void;
  onUseRecent?: () => void;
}) {
  const [custom, setCustom] = useState<Activity[]>([]),
    [customName, setCustomName] = useState("");
  const [defaults, setDefaults] = useState<Record<string, ActivityDefaults>>(
    {},
  );
  const [details, setDetails] = useState<string>(),
    [advanced, setAdvanced] = useState(false);
  const [addFor, setAddFor] = useState<string>(),
    [extraDay, setExtraDay] = useState(1);
  const [error, setError] = useState("");
  const activities = [
    ...routineActivities(rules),
    ...custom.filter(
      (a) => !routineActivities(rules).some((b) => b.key === a.key),
    ),
  ];
  const summary = routineSummary(rules, restDays, unavailableDays);
  function values(a: Activity): ActivityDefaults {
    const row = rules.filter((r) => activityKey(r) === a.key),
      first = row[0];
    return first
      ? {
          durationMinutes: row.every(
            (r) => r.durationMinutes === first.durationMinutes,
          )
            ? first.durationMinutes
            : null,
          time: row.every((r) => r.time === first.time) ? first.time : "",
          timeOfDay: row.every((r) => r.timeOfDay === first.timeOfDay)
            ? first.timeOfDay
            : "Any time",
          subtype: row.every((r) => r.subtype === first.subtype)
            ? first.subtype
            : "",
        }
      : (defaults[a.key] ?? emptyActivityDefaults);
  }
  function updateDefaults(a: Activity, patch: Partial<ActivityDefaults>) {
    setDefaults({ ...defaults, [a.key]: { ...values(a), ...patch } });
    onChange(
      rules.map((r) => (activityKey(r) === a.key ? { ...r, ...patch } : r)),
      restDays,
      unavailableDays,
    );
  }
  function toggle(a: Activity, day: number) {
    const next = toggleActivityDay(rules, a, day, values(a));
    // Selecting training explicitly releases a protected day. Other days stay intact.
    const added =
      next.length > rules.length ||
      !rules.some((r) => activityKey(r) === a.key && r.days.includes(day));
    onChange(
      next,
      added ? restDays.filter((d) => d !== day) : restDays,
      added ? unavailableDays.filter((d) => d !== day) : unavailableDays,
    );
  }
  function addCustom() {
    const label = customName.trim();
    if (!label) {
      setError("Name your custom activity first.");
      return;
    }
    if (
      activities.some(
        (a) =>
          a.label.toLowerCase() === label.toLowerCase() ||
          (a.category.toLowerCase() === label.toLowerCase() &&
            !a.customActivity),
      )
    ) {
      setError("That activity is already in the selector.");
      return;
    }
    const a: Activity = {
      key: `custom:${label.toLowerCase()}`,
      label,
      category: "Other",
      customActivity: label,
    };
    setCustom([...custom, a]);
    setCustomName("");
    setError("");
  }
  return (
    <div className="activity-day-selector" data-context={context}>
      <div className="selector-intro">
        <h2>Which days do you usually do each type of training?</h2>
        <p>Tap the days. Duration and session details can wait.</p>
      </div>
      {(onUseUsual || onUseRecent) && (
        <div className="selector-reuse">
          {onUseUsual && (
            <button
              type="button"
              className="button small"
              onClick={() => {
                setDefaults({});
                onUseUsual();
              }}
            >
              Use My Usual Training Week
            </button>
          )}
          {onUseRecent && (
            <button type="button" className="text-button" onClick={onUseRecent}>
              Use My Recent Training
            </button>
          )}
        </div>
      )}
      <div
        className="activity-matrix"
        role="table"
        aria-label="Activity by weekday"
      >
        <div className="activity-column-head" role="row">
          <span role="columnheader">Activity</span>
          {days.map((d) => (
            <abbr role="columnheader" title={weekdayNames[d]} key={d}>
              {weekdayNames[d].slice(0, 1)}
              <span className="day-name-tail">
                {weekdayNames[d].slice(1, 3)}
              </span>
            </abbr>
          ))}
          <span role="columnheader" className="matrix-duration-heading">
            Typical duration
          </span>
        </div>
        {activities.map((a) => {
          const matching = rules.filter((r) => activityKey(r) === a.key),
            rowValues = values(a),
            varies =
              matching.length > 1 &&
              !matching.every(
                (r) => r.durationMinutes === matching[0].durationMinutes,
              );
          return (
            <div className="activity-matrix-group" key={a.key}>
              <div className="activity-matrix-row" role="row">
                <span className="activity-row-label" role="rowheader">
                  <CategoryIcon category={a.category} size={19} />
                  <strong>{a.label}</strong>
                </span>
                {days.map((day) => {
                  const count = matching.filter((r) =>
                    r.days.includes(day),
                  ).length;
                  return (
                    <div role="cell" key={day}>
                      <button
                        type="button"
                        aria-label={`${a.label} on ${weekdayNames[day]}`}
                        aria-pressed={count > 0}
                        className={`activity-day-toggle ${count ? "selected" : ""}`}
                        onClick={() => toggle(a, day)}
                      >
                        {count > 1 ? (
                          <span>{count}</span>
                        ) : count ? (
                          <Check size={19} />
                        ) : (
                          <Plus size={15} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  );
                })}
                <label className="activity-duration" role="cell">
                  <span>
                    Typical duration <small>(optional)</small>
                  </span>
                  <div>
                    <input
                      aria-label={`Typical duration for ${a.label} (min)`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={720}
                      value={rowValues.durationMinutes ?? ""}
                      placeholder={varies ? "Varies" : "Not set"}
                      onChange={(e) => {
                        const n =
                          e.target.value === "" ? null : Number(e.target.value);
                        if (
                          n === null ||
                          (n >= 1 && n <= 720 && Number.isInteger(n))
                        )
                          updateDefaults(a, { durationMinutes: n });
                      }}
                    />
                    <small>min</small>
                  </div>
                </label>
              </div>
              <div className="activity-row-options">
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setDetails(details === a.key ? undefined : a.key)
                  }
                  aria-expanded={details === a.key}
                >
                  Optional details
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setAddFor(addFor === a.key ? undefined : a.key);
                    setExtraDay(matching[0]?.days[0] ?? 1);
                  }}
                  aria-expanded={addFor === a.key}
                >
                  + Another Session
                  <span className="visually-hidden"> for {a.label}</span>
                </button>
                {!defaultActivities.some((x) => x.key === a.key) && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      onChange(
                        rules.filter((r) => activityKey(r) !== a.key),
                        restDays,
                        unavailableDays,
                      );
                      setCustom(custom.filter((x) => x.key !== a.key));
                    }}
                    aria-label={`Remove activity ${a.label}`}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {addFor === a.key && (
                <div className="selector-extra">
                  <Field label={`Another ${a.label} session on`}>
                    <select
                      value={extraDay}
                      onChange={(e) => setExtraDay(Number(e.target.value))}
                    >
                      {days.map((d) => (
                        <option key={d} value={d}>
                          {weekdayNames[d]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      onChange(
                        [
                          ...rules,
                          anotherActivitySession(a, extraDay, rowValues),
                        ],
                        restDays.filter((d) => d !== extraDay),
                        unavailableDays.filter((d) => d !== extraDay),
                      )
                    }
                  >
                    Add another {a.label} session
                  </button>
                  <p>
                    Each session stays separate. A day showing “2” has two
                    sessions.
                  </p>
                </div>
              )}
              {details === a.key && (
                <div className="selector-details">
                  <div className="schedule-tools">
                    <Field label={`Time of day for ${a.label}`}>
                      <select
                        value={rowValues.timeOfDay ?? "Any time"}
                        onChange={(e) =>
                          updateDefaults(a, {
                            timeOfDay: e.target
                              .value as WeeklyRule["timeOfDay"],
                          })
                        }
                      >
                        {["Any time", "Morning", "Afternoon", "Evening"].map(
                          (t) => (
                            <option key={t}>{t}</option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label={`Start time for ${a.label} (optional)`}>
                      <input
                        type="time"
                        value={rowValues.time}
                        onChange={(e) =>
                          updateDefaults(a, { time: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={`Session subtype for ${a.label} (optional)`}>
                      <input
                        maxLength={100}
                        value={rowValues.subtype}
                        onChange={(e) =>
                          updateDefaults(a, { subtype: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  {matching.some((r) =>
                    r.days.some(
                      (day) =>
                        matching.filter((x) => x.days.includes(day)).length > 1,
                    ),
                  ) && (
                    <div className="selector-independent">
                      <h3>Individual session details</h3>
                      {matching.flatMap((r) =>
                        r.days.map((day) => (
                          <div
                            className="selector-occurrence"
                            key={`${r.id}:${day}`}
                          >
                            <strong>
                              {weekdayNames[day]} · {r.title}
                            </strong>
                            <Field
                              label={`Minutes for session ${r.id} on ${weekdayNames[day]}`}
                            >
                              <input
                                type="number"
                                min={1}
                                max={720}
                                value={r.durationMinutes ?? ""}
                                placeholder="Unknown"
                                onChange={(e) => {
                                  const n =
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value);
                                  if (n === null || (n >= 1 && n <= 720))
                                    onChange(
                                      changeRuleOccurrence(rules, r.id, day, {
                                        durationMinutes: n,
                                      }),
                                      restDays,
                                      unavailableDays,
                                    );
                                }}
                              />
                            </Field>
                            <select
                              aria-label={`Time of day for session ${r.id} on ${weekdayNames[day]}`}
                              value={r.timeOfDay ?? "Any time"}
                              onChange={(e) =>
                                onChange(
                                  changeRuleOccurrence(rules, r.id, day, {
                                    timeOfDay: e.target
                                      .value as WeeklyRule["timeOfDay"],
                                  }),
                                  restDays,
                                  unavailableDays,
                                )
                              }
                            >
                              {[
                                "Any time",
                                "Morning",
                                "Afternoon",
                                "Evening",
                              ].map((t) => (
                                <option key={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                        )),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="selector-bottom">
        <div
          className="selector-count"
          role="status"
          aria-label="Weekly routine count"
          aria-live="polite"
        >
          <strong>
            {summary.count} session{summary.count === 1 ? "" : "s"} per week
          </strong>
          <span>
            {summary.unknownDuration
              ? `${summary.unknownDuration} duration${summary.unknownDuration === 1 ? "" : "s"} not set${summary.knownMinutes ? ` · ${summary.knownMinutes} known planned minutes` : ""}`
              : `${summary.knownMinutes} planned minutes`}
          </span>
        </div>
        <form
          className="selector-custom"
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <label>
            <span className="visually-hidden">Custom training category</span>
            <input
              aria-label="Custom training category"
              value={customName}
              maxLength={80}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Custom activity"
            />
          </label>
          <button type="submit" className="button small">
            Add activity
          </button>
        </form>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <details className="selector-availability">
        <summary>Rest days and availability (optional)</summary>
        <div className="selector-availability-days">
          {days.map((day) => (
            <label key={day}>
              {weekdayNames[day]}
              <select
                aria-label={`${weekdayNames[day]} availability`}
                value={
                  unavailableDays.includes(day)
                    ? "unavailable"
                    : restDays.includes(day)
                      ? "rest"
                      : "available"
                }
                onChange={(e) =>
                  onChange(
                    rules,
                    e.target.value === "rest"
                      ? [...restDays.filter((d) => d !== day), day]
                      : restDays.filter((d) => d !== day),
                    e.target.value === "unavailable"
                      ? [...unavailableDays.filter((d) => d !== day), day]
                      : unavailableDays.filter((d) => d !== day),
                  )
                }
              >
                <option value="available">Available</option>
                <option value="rest">Rest day</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
          ))}
        </div>
        <p className="helper">
          Protected days are excluded from generation. Selecting training on a
          day makes that day available.
        </p>
      </details>
      <details
        className="selector-advanced"
        open={advanced}
        onToggle={(e) => setAdvanced(e.currentTarget.open)}
      >
        <summary>
          <SlidersHorizontal size={16} /> Advanced weekly calendar editor
        </summary>
        {advanced && (
          <WeeklyEditor
            rules={rules}
            restDays={restDays}
            unavailableDays={unavailableDays}
            onChange={onChange}
          />
        )}
      </details>
    </div>
  );
}
