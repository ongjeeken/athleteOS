import { useState } from "react";
import { Copy, Edit2, Plus, Trash2 } from "lucide-react";
import { categories, type WeeklyRule } from "../domain/models";
import { Field, Modal, CategoryIcon, categoryClass } from "./ui";
export const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function WeeklyEditor({
  rules,
  restDays,
  unavailableDays,
  onChange,
  onHistory,
}: {
  onHistory?: () => void;
  rules: WeeklyRule[];
  restDays: number[];
  unavailableDays: number[];
  onChange: (
    rules: WeeklyRule[],
    rest: number[],
    unavailable: number[],
  ) => void;
}) {
  const [edit, setEdit] = useState<{ day: number; rule?: WeeklyRule }>();
  const [selection, setSelection] = useState<string[]>([]);
  const [undo, setUndo] = useState<WeeklyRule[]>();
  const update = (next: WeeklyRule[]) => {
    setUndo(rules);
    onChange(next, restDays, unavailableDays);
  };
  const patch = (id: string, values: Partial<WeeklyRule>) =>
    update(rules.map((r) => (r.id === id ? { ...r, ...values } : r)));
  function preset(full: boolean) {
    const slots = full
      ? ([
          [1, "Fencing", 90],
          [2, "Strength", 60],
          [4, "Fencing", 90],
          [5, "Strength", 60],
          [6, "Conditioning", 45],
        ] as const)
      : ([
          [1, "Fencing", 90],
          [3, "Strength", 60],
          [6, "Fencing", 90],
        ] as const);
    onChange(
      slots.map(([day, category, durationMinutes]) => ({
        id: crypto.randomUUID(),
        title: category + " session",
        category,
        days: [day],
        durationMinutes,
        time: "",
        subtype: "",
      })),
      full ? [0, 3] : [],
      [],
    );
  }
  return (
    <div className="weekly-editor">
      <div className="schedule-tools">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={rules.length > 0 && selection.length === rules.length}
            onChange={(e) =>
              setSelection(e.target.checked ? rules.map((r) => r.id) : [])
            }
          />{" "}
          Select week
        </label>
        {selection.length > 0 && (
          <>
            <span>{selection.length} selected</span>
            <button
              type="button"
              className="button small"
              onClick={() =>
                update([
                  ...rules,
                  ...rules
                    .filter((r) => selection.includes(r.id))
                    .map((r) => ({ ...r, id: crypto.randomUUID() })),
                ])
              }
            >
              Duplicate selected
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => {
                update(rules.filter((r) => !selection.includes(r.id)));
                setSelection([]);
              }}
            >
              Remove selected
            </button>
            <select
              aria-label="Move selected sessions to day"
              value=""
              onChange={(e) => {
                if (e.target.value !== "")
                  update(
                    rules.map((r) =>
                      selection.includes(r.id)
                        ? { ...r, days: [Number(e.target.value)] }
                        : r,
                    ),
                  );
              }}
            >
              <option value="">Move selected to…</option>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {weekdayNames[d]}
                </option>
              ))}
            </select>
            <input
              aria-label="Duration for selected sessions"
              type="number"
              min={1}
              max={720}
              placeholder="Minutes"
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= 720 && Number.isInteger(n)) {
                  update(
                    rules.map((r) =>
                      selection.includes(r.id)
                        ? { ...r, durationMinutes: n }
                        : r,
                    ),
                  );
                  e.target.value = "";
                }
              }}
            />
          </>
        )}
        {undo && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onChange(undo, restDays, unavailableDays);
              setUndo(undefined);
            }}
          >
            Undo week edit
          </button>
        )}
        {onHistory && (
          <button type="button" className="text-button" onClick={onHistory}>
            Use My Training History to Plan Ahead
          </button>
        )}
      </div>
      <div className="week-presets">
        <span>Start with a template, then make it yours.</span>
        <button
          type="button"
          className="button small"
          onClick={() => preset(true)}
        >
          Fencing + strength
        </button>
        <button
          type="button"
          className="button small"
          onClick={() => preset(false)}
        >
          Three-day week
        </button>
      </div>
      <div className="week-builder-grid">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
          <section key={day} className="week-builder-day">
            <div className="row spread">
              <h3>{weekdayNames[day]}</h3>
              <button
                type="button"
                className="icon-button"
                aria-label={`Add session on ${weekdayNames[day]}`}
                onClick={() => setEdit({ day })}
              >
                <Plus size={17} />
              </button>
            </div>
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
            {rules
              .filter((r) => r.days.includes(day))
              .map((rule) => (
                <div
                  className={`week-rule ${categoryClass(rule.category)}`}
                  key={rule.id}
                >
                  <div className="row">
                    <CategoryIcon category={rule.category} size={15} />
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        aria-label={`Select ${rule.title} on ${weekdayNames[day]}`}
                        checked={selection.includes(rule.id)}
                        onChange={(e) =>
                          setSelection(
                            e.target.checked
                              ? [...selection, rule.id]
                              : selection.filter((id) => id !== rule.id),
                          )
                        }
                      />
                      <strong>{rule.title}</strong>
                    </label>
                  </div>
                  <div className="rule-inline">
                    <select
                      aria-label={`Activity for ${rule.title} on ${weekdayNames[day]}`}
                      value={rule.category}
                      onChange={(e) =>
                        patch(rule.id, {
                          category: e.target.value as WeeklyRule["category"],
                          customActivity: undefined,
                        })
                      }
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <label>
                      Min
                      <input
                        aria-label={`Minutes for ${rule.title} on ${weekdayNames[day]}`}
                        type="number"
                        min={1}
                        max={720}
                        value={rule.durationMinutes ?? ""}
                        onChange={(e) => {
                          if (e.target.value === "") {
                            patch(rule.id, { durationMinutes: null });
                            return;
                          }
                          const n = Number(e.target.value);
                          if (n >= 1 && n <= 720 && Number.isInteger(n))
                            patch(rule.id, { durationMinutes: n });
                        }}
                      />
                    </label>
                    <select
                      aria-label={`Time of day for ${rule.title} on ${weekdayNames[day]}`}
                      value={rule.timeOfDay ?? "Any time"}
                      onChange={(e) =>
                        patch(rule.id, {
                          timeOfDay: e.target.value as WeeklyRule["timeOfDay"],
                        })
                      }
                    >
                      {["Any time", "Morning", "Afternoon", "Evening"].map(
                        (t) => (
                          <option key={t}>{t}</option>
                        ),
                      )}
                    </select>
                    {rule.time && <small>{rule.time}</small>}
                  </div>
                  {(restDays.includes(day) ||
                    unavailableDays.includes(day)) && (
                    <small>Won’t be scheduled on a protected day.</small>
                  )}
                  <div className="week-rule-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${rule.title} on ${weekdayNames[day]}`}
                      onClick={() => setEdit({ day, rule })}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Duplicate ${rule.title} on ${weekdayNames[day]}`}
                      onClick={() =>
                        update([
                          ...rules,
                          { ...rule, id: crypto.randomUUID(), days: [day] },
                        ])
                      }
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${rule.title} on ${weekdayNames[day]}`}
                      onClick={() =>
                        update(
                          rule.days.length === 1
                            ? rules.filter((r) => r.id !== rule.id)
                            : rules.map((r) =>
                                r.id === rule.id
                                  ? {
                                      ...r,
                                      days: r.days.filter((d) => d !== day),
                                    }
                                  : r,
                              ),
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <label className="copy-day">
                    Move to
                    <select
                      aria-label={`Move ${rule.title} from ${weekdayNames[day]} to day`}
                      value=""
                      onChange={(e) => {
                        if (e.target.value !== "")
                          patch(rule.id, {
                            days: rule.days.map((d) =>
                              d === day ? Number(e.target.value) : d,
                            ),
                          });
                      }}
                    >
                      <option value="">Choose day</option>
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                        <option key={d} value={d}>
                          {weekdayNames[d]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="copy-day">
                    Copy to
                    <select
                      aria-label={`Copy ${rule.title} from ${weekdayNames[day]} to day`}
                      value=""
                      onChange={(e) => {
                        if (e.target.value !== "")
                          update([
                            ...rules,
                            {
                              ...rule,
                              id: crypto.randomUUID(),
                              days: [Number(e.target.value)],
                            },
                          ]);
                      }}
                    >
                      <option value="">Choose day</option>
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                        <option key={d} value={d}>
                          {weekdayNames[d]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            {!rules.some((r) => r.days.includes(day)) && (
              <p className="week-empty">
                {restDays.includes(day)
                  ? "Space to recover"
                  : unavailableDays.includes(day)
                    ? "Protected time"
                    : "No sessions yet"}
              </p>
            )}
          </section>
        ))}
      </div>
      <p className="helper">
        Durations are approximate planned time. A typical week does not create
        completed workouts or historical RPE.
      </p>
      {edit && (
        <Modal
          title={edit.rule ? "Edit recurring session" : "Add recurring session"}
          description={weekdayNames[edit.day] + " · exact time is optional."}
          onClose={() => setEdit(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const category = String(
                f.get("category"),
              ) as WeeklyRule["category"];
              const rule: WeeklyRule = {
                id: edit.rule?.id ?? crypto.randomUUID(),
                days: edit.rule?.days ?? [edit.day],
                title: String(f.get("title")).trim() || category + " session",
                category,
                customActivity:
                  category === edit.rule?.category
                    ? edit.rule?.customActivity
                    : undefined,
                subtype: String(f.get("subtype")),
                durationMinutes:
                  f.get("duration") === "" ? null : Number(f.get("duration")),
                time: String(f.get("time")),
                timeOfDay: String(
                  f.get("timeOfDay"),
                ) as WeeklyRule["timeOfDay"],
              };
              update(
                edit.rule
                  ? rules.map((r) => (r.id === rule.id ? rule : r))
                  : [...rules, rule],
              );
              setEdit(undefined);
            }}
          >
            <Field label="Training category">
              <select
                name="category"
                defaultValue={edit.rule?.category ?? "Fencing"}
              >
                {categories
                  .filter((c) => c !== "Competition")
                  .map((c) => (
                    <option key={c} value={c}>
                      {c === "Mobility" ? "Mobility / recovery" : c}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Approximate duration (min)">
              <input
                type="number"
                name="duration"
                min={1}
                max={720}
                defaultValue={
                  edit.rule ? (edit.rule.durationMinutes ?? "") : ""
                }
              />
            </Field>
            <Field label="Start time (optional)">
              <input
                type="time"
                name="time"
                defaultValue={edit.rule?.time ?? ""}
              />
            </Field>
            <Field label="Time of day (optional)">
              <select
                name="timeOfDay"
                defaultValue={edit.rule?.timeOfDay ?? "Any time"}
              >
                {["Any time", "Morning", "Afternoon", "Evening"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Session name (optional)">
              <input
                name="title"
                maxLength={150}
                defaultValue={edit.rule?.title}
              />
            </Field>
            <Field label="Training focus (optional)">
              <input name="subtype" defaultValue={edit.rule?.subtype} />
            </Field>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEdit(undefined)}
              >
                Cancel
              </button>
              <button className="button primary">Save recurring session</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
