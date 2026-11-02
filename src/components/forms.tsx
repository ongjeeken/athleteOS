import type { RoutineEditRequest } from "../domain/routine";
import { useState } from "react";
import type { FormEvent } from "react";
import { useForm } from "react-hook-form";
import { ZodError } from "zod";
import { Plus, Trash2 } from "lucide-react";
import {
  categories,
  checkInSchema,
  trainingGoals,
  trainingContexts,
  defaultProfile,
  identity,
  painSchema,
  planSchema,
  profileSchema,
  sessionSchema,
  tournamentSchema,
  type CheckIn,
  type Data,
  type Dataset,
  type Exercise,
  type Plan,
  type Profile,
  type Session,
  type StrengthSet,
  type Tournament,
} from "../domain/models";
import { today } from "../domain/dates";
import { sessionLoad } from "../domain/analytics";
import { editOccurrence, editTrainingWeek } from "../schedule-storage";
import { db, saveSession } from "../db";
import { ErrorMessage, Field, Modal } from "./ui";
import { RpeInput } from "./rpe";
const num = (fd: FormData, k: string) =>
  fd.get(k) === "" ? undefined : Number(fd.get(k));
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
export const errorText = (e: unknown) =>
  e instanceof ZodError
    ? e.issues.map((i) => `${i.path.join(" ")}: ${i.message}`).join(". ")
    : e instanceof Error
      ? e.message
      : "Could not save. Check browser storage and try again.";
function useSave(onDone: () => void) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return {
    error,
    busy,
    save: async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError("");
      try {
        await fn();
        onDone();
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
  };
}
export function TournamentForm({
  dataset,
  date,
  initial,
  onClose,
}: {
  dataset: Dataset;
  date: string;
  initial?: Tournament;
  onClose: () => void;
}) {
  const s = useSave(onClose);
  return (
    <Modal
      title={initial ? "Edit tournament" : "Add tournament"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void s.save(async () => {
            const t = tournamentSchema.parse({
              ...identity(dataset, initial?.id),
              ...initial,
              updatedAt: new Date().toISOString(),
              name: str(f, "name").trim(),
              startDate: str(f, "startDate"),
              endDate: str(f, "endDate"),
              priority: str(f, "priority"),
              location: str(f, "location"),
              goal: str(f, "goal"),
              notes: str(f, "notes"),
              results: str(f, "results"),
            });
            await db.tournaments.put(t);
          });
        }}
      >
        <Field label="Tournament name">
          <input
            name="name"
            defaultValue={initial?.name}
            placeholder="e.g. National Championships"
            required
            maxLength={150}
          />
        </Field>
        <div className="form-grid">
          <Field label="Start date">
            <input
              type="date"
              name="startDate"
              defaultValue={initial?.startDate ?? date}
              required
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              name="endDate"
              defaultValue={initial?.endDate ?? date}
              required
            />
          </Field>
        </div>
        <Field
          label="Priority"
          hint="A: main objective · B: important · C: development"
        >
          <select name="priority" defaultValue={initial?.priority ?? "B"}>
            <option value="A">A — Main objective</option>
            <option value="B">B — Important event</option>
            <option value="C">C — Development event</option>
          </select>
        </Field>
        <Field label="Location (optional)">
          <input name="location" defaultValue={initial?.location} />
        </Field>
        <Field label="Performance goal (optional)">
          <input name="goal" defaultValue={initial?.goal} />
        </Field>
        <Field label="Notes (optional)">
          <textarea name="notes" defaultValue={initial?.notes} />
        </Field>
        <Field label="Actual results (optional)">
          <input name="results" defaultValue={initial?.results} />
        </Field>
        <ErrorMessage error={s.error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={s.busy}>
            {s.busy ? "Saving…" : "Save tournament"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PlanForm({
  dataset,
  date,
  initial,
  onClose,
  onEditRoutine,
  athleteDate,
}: {
  athleteDate?: string;
  dataset: Dataset;
  date: string;
  initial?: Plan;
  onClose: () => void;
  onEditRoutine?: (request: RoutineEditRequest) => void;
}) {
  const s = useSave(onClose);
  const [scope, setScope] = useState<"session" | "week" | "future" | "usual">(
    "session",
  );
  const [rest, setRest] = useState(initial?.status === "rest");
  return (
    <Modal
      title={initial ? "Edit planned session" : "Plan a session"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void s.save(async () => {
            const value = planSchema.parse({
              ...identity(dataset, initial?.id),
              ...initial,
              updatedAt: new Date().toISOString(),
              date: str(f, "date"),
              time: str(f, "time"),
              title: rest ? "Rest day" : str(f, "title").trim(),
              category: rest ? "Mobility" : str(f, "category"),
              customActivity:
                initial?.category === str(f, "category")
                  ? initial.customActivity
                  : undefined,
              duration: rest ? 0 : (num(f, "duration") ?? null),
              rpe: rest ? null : (num(f, "rpe") ?? null),
              status: rest ? "rest" : "planned",
              locked: f.has("locked"),
              origin: "manual",
              provisional: false,
              subtype: str(f, "subtype"),
              notes: str(f, "notes"),
            });
            if (
              initial &&
              (scope === "future" || scope === "usual") &&
              onEditRoutine
            ) {
              onEditRoutine({ original: initial, changed: value, scope });
              return;
            }
            if (initial && scope === "week")
              await editTrainingWeek(initial, value, athleteDate ?? date);
            else await editOccurrence(value);
          });
        }}
      >
        <label className="checkbox">
          <input
            type="checkbox"
            checked={rest}
            onChange={(e) => setRest(e.target.checked)}
          />
          Protect a rest day
        </label>
        <div className="form-grid">
          <Field label="Date">
            <input
              type="date"
              name="date"
              defaultValue={initial?.date ?? date}
              required
            />
          </Field>
          <Field label="Time (optional)">
            <input type="time" name="time" defaultValue={initial?.time ?? ""} />
          </Field>
        </div>
        {!rest && (
          <>
            <Field label="Session title">
              <input
                name="title"
                required
                defaultValue={initial?.title}
                placeholder="e.g. Technical fencing"
                maxLength={150}
              />
            </Field>
            <Field label="Activity">
              <select
                name="category"
                defaultValue={initial?.category ?? "Fencing"}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Planned duration (min)">
                <input
                  name="duration"
                  type="number"
                  min={1}
                  max={720}
                  defaultValue={initial?.duration ?? ""}
                />
              </Field>
              <Field label="Target RPE (optional)">
                <input
                  name="rpe"
                  type="number"
                  min={0}
                  max={10}
                  step="0.5"
                  defaultValue={initial?.rpe ?? ""}
                />
              </Field>
            </div>
            <Field label="Training focus (optional)">
              <input name="subtype" defaultValue={initial?.subtype} />
            </Field>
          </>
        )}
        <Field label="Target notes (optional)">
          <textarea name="notes" defaultValue={initial?.notes} />
        </Field>
        <label className="checkbox">
          <input
            name="locked"
            type="checkbox"
            defaultChecked={initial?.locked}
          />
          Lock this session against suggested adjustments
        </label>
        {initial && (initial.seriesId || initial.origin === "weekly") && (
          <Field
            label="Apply this change to"
            hint={
              scope === "week"
                ? "Update matching activity and time-of-day sessions in this week. Completed, locked and other individual edits are protected."
                : scope === "future" || scope === "usual"
                  ? "Review the shared activity-by-day selector next. Saving a routine does not change completed history."
                  : "Your routine and other sessions stay unchanged."
            }
          >
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="session">Change this session only</option>
              <option value="week">Change this week only</option>
              {initial.seriesId && onEditRoutine && (
                <option value="future">Change future occurrences</option>
              )}
              {onEditRoutine && (
                <option value="usual">Update my usual training week</option>
              )}
            </select>
          </Field>
        )}
        <ErrorMessage error={s.error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={s.busy}>
            {scope === "future" || scope === "usual"
              ? "Review routine changes"
              : scope === "week"
                ? "Save this week only"
                : "Save plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SessionForm({
  dataset,
  date,
  data,
  initial,
  plan,
  onClose,
}: {
  dataset: Dataset;
  date: string;
  data: Data;
  initial?: Session;
  plan?: Plan;
  onClose: () => void;
}) {
  const s = useSave(onClose);
  const sessionId = initial?.id ?? crypto.randomUUID();
  const [rpeMode, setRpeMode] = useState<"quick" | "detailed">(
    initial?.rpeInputMode ?? data.profile?.defaultRpeMode ?? "quick",
  );
  const { register, watch, handleSubmit, setValue } = useForm<{
    date: string;
    time: string;
    timeOfDay: NonNullable<Session["timeOfDay"]>;
    title: string;
    category: Session["category"];
    duration: string;
    rpe: string;
  }>({
    defaultValues: {
      date: initial?.date ?? plan?.date ?? date,
      time: initial?.time ?? "",
      timeOfDay: initial?.timeOfDay ?? plan?.timeOfDay ?? "Any time",
      title: initial?.title ?? plan?.title ?? "",
      category: initial?.category ?? plan?.category ?? "Fencing",
      duration: String(initial?.durationMinutes ?? plan?.duration ?? ""),
      rpe: String(initial?.rpe ?? ""),
    },
  });
  const category = watch("category"),
    load = sessionLoad(
      watch("duration") === "" ? null : Number(watch("duration")),
      watch("rpe") === "" ? null : Number(watch("rpe")),
    );
  const initialExercises = data.exercises.filter(
    (e) => e.sessionId === initial?.id,
  );
  const [strength, setStrength] = useState(
    initialExercises.length
      ? initialExercises.flatMap((e) =>
          data.sets
            .filter((s) => s.exerciseId === e.id)
            .map((s) => ({
              name: e.name,
              reps: s.reps,
              weight: s.weight,
              setRpe: s.setRpe,
              rir: s.rir,
            })),
        )
      : [
          {
            name: "",
            reps: 5,
            weight: 0,
            setRpe: undefined as number | undefined,
            rir: undefined as number | undefined,
          },
        ],
  );
  return (
    <Modal
      title={
        initial
          ? "Edit completed session"
          : plan
            ? "Complete your session"
            : "Log a session"
      }
      description="A quick record of the work, and how it felt."
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit((values, event) => {
          const f = new FormData(event!.target as HTMLFormElement);
          void s.save(async () => {
            if (values.date > date)
              throw new Error(
                "Completed sessions cannot be logged in the future. Use the calendar to plan them.",
              );
            const value = sessionSchema.parse({
              ...identity(dataset, sessionId),
              ...initial,
              updatedAt: new Date().toISOString(),
              ...values,
              title: values.title.trim() || values.category + " session",
              durationMinutes: Number(values.duration),
              rpe: values.rpe === "" ? null : Number(values.rpe),
              rpeInputMode: rpeMode,
              sessionLoad: sessionLoad(
                Number(values.duration),
                values.rpe === "" ? null : Number(values.rpe),
              ),
              customActivity:
                values.category === (initial?.category ?? plan?.category)
                  ? (initial?.customActivity ?? plan?.customActivity)
                  : undefined,
              plannedSessionId: initial?.plannedSessionId ?? plan?.id,
              notes: str(f, "notes"),
              provenance: initial?.provenance
                ? {
                    ...initial.provenance,
                    estimatedFields: [
                      ...initial.provenance.estimatedFields.filter(
                        (k) => k !== "durationMinutes",
                      ),
                      ...(f.has("durationEstimated")
                        ? ["durationMinutes" as const]
                        : []),
                    ],
                  }
                : undefined,
              subtype: str(f, "subtype"),
              tournamentId: str(f, "tournamentId") || undefined,
              bouts: num(f, "bouts"),
              activeMinutes: num(f, "activeMinutes"),
              legFatigue: num(f, "legFatigue"),
              cognitiveDemand: num(f, "cognitiveDemand"),
              modality: str(f, "modality"),
              distance: num(f, "distance"),
              emphasis: str(f, "emphasis") || undefined,
              results: str(f, "results"),
              postFatigue: num(f, "postFatigue"),
            });
            const es: Exercise[] = [],
              sets: StrengthSet[] = [];
            if (category === "Strength") {
              const names = [
                ...new Set(
                  strength
                    .filter((e) => e.name.trim())
                    .map((e) => e.name.trim()),
                ),
              ];
              names.forEach((name) => {
                const exercise = {
                  ...identity(dataset),
                  sessionId: value.id,
                  name,
                  emphasis: value.emphasis ?? "Full body",
                };
                es.push(exercise);
                strength
                  .filter((e) => e.name.trim() === name)
                  .forEach((row, i) =>
                    sets.push({
                      ...identity(dataset),
                      exerciseId: exercise.id,
                      order: i + 1,
                      reps: row.reps,
                      weight: row.weight,
                      setRpe: row.setRpe,
                      rir: row.rir,
                    }),
                  );
              });
            }
            await saveSession(value, es, sets);
          });
        })}
      >
        <div className="form-grid">
          <Field label="Date">
            <input
              type="date"
              max={date}
              {...register("date", { required: true })}
            />
          </Field>
          <Field label="Activity">
            <select {...register("category")}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="Actual duration (min)"
          hint="Meaningful exercise time, including warm-up"
        >
          <input
            type="number"
            min="1"
            max="720"
            required
            {...register("duration", { required: true })}
          />
        </Field>
        <RpeInput
          value={watch("rpe") === "" ? null : Number(watch("rpe"))}
          mode={rpeMode}
          onModeChange={setRpeMode}
          onChange={(v) => setValue("rpe", v === null ? "" : String(v))}
        />
        <div className="load-preview">
          <span>Session load</span>
          <strong>
            {load === null ? "—" : load.toLocaleString()} <small>AU</small>
          </strong>
        </div>
        <details className="details" open={initial ? true : undefined}>
          <summary>Add {category.toLowerCase()} details</summary>
          {initial?.provenance && (
            <label className="checkbox">
              <input
                type="checkbox"
                name="durationEstimated"
                defaultChecked={initial.provenance.estimatedFields.includes(
                  "durationMinutes",
                )}
              />
              Duration is an estimate
            </label>
          )}
          <div className="form-grid">
            <Field label="Session title (optional)">
              <input
                {...register("title")}
                placeholder={`${category} session`}
                maxLength={150}
              />
            </Field>
            <Field label="Time (optional)">
              <input type="time" {...register("time")} />
            </Field>
            <Field label="Time of day (optional)">
              <select {...register("timeOfDay")}>
                {["Any time", "Morning", "Afternoon", "Evening"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          {(category === "Fencing" || category === "Competition") && (
            <>
              <Field label="Fencing focus">
                <select
                  name="subtype"
                  defaultValue={initial?.subtype ?? "Mixed"}
                >
                  {[
                    "Lesson",
                    "Footwork",
                    "Technical drilling",
                    "Tactical training",
                    "Sparring",
                    "Competition",
                    "Mixed",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Number of bouts">
                  <input
                    type="number"
                    name="bouts"
                    min={0}
                    defaultValue={initial?.bouts}
                  />
                </Field>
                <Field label="Active fencing time (min)">
                  <input
                    type="number"
                    name="activeMinutes"
                    min={0}
                    max={720}
                    defaultValue={initial?.activeMinutes}
                  />
                </Field>
                <Field label="Leg fatigue (0–10)">
                  <input
                    type="number"
                    name="legFatigue"
                    min={0}
                    max={10}
                    defaultValue={initial?.legFatigue}
                  />
                </Field>
                <Field label="Cognitive demand (0–10)">
                  <input
                    type="number"
                    name="cognitiveDemand"
                    min={0}
                    max={10}
                    defaultValue={initial?.cognitiveDemand}
                  />
                </Field>
              </div>
            </>
          )}
          {category === "Competition" && (
            <>
              <Field label="Associated tournament">
                <select
                  name="tournamentId"
                  defaultValue={initial?.tournamentId ?? ""}
                >
                  <option value="">No association</option>
                  {data.tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Results">
                <input name="results" defaultValue={initial?.results} />
              </Field>
              <Field label="Post-competition fatigue (0–10)">
                <input
                  type="number"
                  min={0}
                  max={10}
                  name="postFatigue"
                  defaultValue={initial?.postFatigue}
                />
              </Field>
            </>
          )}
          {category === "Conditioning" && (
            <div className="form-grid">
              <Field label="Modality">
                <input
                  name="modality"
                  defaultValue={initial?.modality}
                  placeholder="e.g. Cycle intervals"
                />
              </Field>
              <Field label="Distance (km, optional)">
                <input
                  name="distance"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={initial?.distance}
                />
              </Field>
            </div>
          )}
          {category === "Strength" && (
            <>
              <Field label="Strength emphasis">
                <select
                  name="emphasis"
                  defaultValue={initial?.emphasis ?? "Full body"}
                >
                  {["Full body", "Lower body", "Upper body"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <p className="helper">
                Each row is one set. Weight, reps and intensity stay separate
                from session load.
              </p>
              {strength.map((e, i) => (
                <div className="strength-row" key={i}>
                  <Field label="Exercise">
                    <input
                      aria-label={`Exercise ${i + 1}`}
                      value={e.name}
                      onChange={(ev) =>
                        setStrength((v) =>
                          v.map((r, j) =>
                            j === i ? { ...r, name: ev.target.value } : r,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Reps">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={e.reps}
                      onChange={(ev) =>
                        setStrength((v) =>
                          v.map((r, j) =>
                            j === i
                              ? { ...r, reps: Number(ev.target.value) }
                              : r,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="kg">
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step="0.5"
                      value={e.weight}
                      onChange={(ev) =>
                        setStrength((v) =>
                          v.map((r, j) =>
                            j === i
                              ? { ...r, weight: Number(ev.target.value) }
                              : r,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Set RPE">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step="0.5"
                      value={e.setRpe ?? ""}
                      onChange={(ev) =>
                        setStrength((v) =>
                          v.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  setRpe:
                                    ev.target.value === ""
                                      ? undefined
                                      : Number(ev.target.value),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="RIR">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={e.rir ?? ""}
                      onChange={(ev) =>
                        setStrength((v) =>
                          v.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  rir:
                                    ev.target.value === ""
                                      ? undefined
                                      : Number(ev.target.value),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove set ${i + 1}`}
                    onClick={() =>
                      setStrength((v) => v.filter((_, j) => i !== j))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button small"
                onClick={() =>
                  setStrength((v) => [
                    ...v,
                    {
                      name: v.at(-1)?.name ?? "",
                      reps: 5,
                      weight: 0,
                      setRpe: undefined,
                      rir: undefined,
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add set
              </button>
            </>
          )}
          <Field label="Notes (optional)">
            <textarea
              name="notes"
              defaultValue={initial?.notes}
              placeholder="What mattered today?"
            />
          </Field>
        </details>
        <ErrorMessage error={s.error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={s.busy}>
            Save session
          </button>
        </div>
      </form>
    </Modal>
  );
}
const scales = [
  ["sleep", "Sleep quality", "Very poor", "Excellent"],
  ["energy", "Energy", "Very low", "Excellent"],
  ["fatigue", "Fatigue", "None", "Extreme"],
  ["soreness", "Muscle soreness", "None", "Extreme"],
  ["stress", "Stress", "None", "Extreme"],
] as const;
export function CheckInForm({
  dataset,
  date,
  initial,
  data,
  onClose,
}: {
  dataset: Dataset;
  date: string;
  initial?: CheckIn;
  data: Data;
  onClose: () => void;
}) {
  const s = useSave(onClose);
  const [pain, setPain] = useState(false);
  return (
    <Modal
      title={initial ? "Update your check-in" : "How are you feeling?"}
      description="A quick reflection. Compare with your own usual, not someone else’s."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void s.save(async () => {
            const c = checkInSchema.parse({
              ...identity(dataset, initial?.id),
              ...initial,
              updatedAt: new Date().toISOString(),
              date,
              sleepHours: num(f, "sleepHours"),
              sleep: num(f, "sleep"),
              energy: num(f, "energy"),
              fatigue: num(f, "fatigue"),
              soreness: num(f, "soreness"),
              stress: num(f, "stress"),
              mental: num(f, "mental"),
              motivation: num(f, "motivation"),
              notes: str(f, "notes"),
            });
            const symptom = pain
              ? painSchema.parse({
                  ...identity(dataset),
                  date,
                  location: str(f, "location"),
                  severity: num(f, "severity"),
                  during: str(f, "during"),
                  nextDay: str(f, "nextDay"),
                  trend: str(f, "trend"),
                  notes: str(f, "painNotes"),
                })
              : undefined;
            await db.transaction("rw", [db.checkIns, db.pain], async () => {
              await db.checkIns.put(c);
              if (symptom) await db.pain.put(symptom);
            });
          });
        }}
      >
        <Field label="Sleep duration (hours, optional)">
          <input
            name="sleepHours"
            type="number"
            min={0}
            max={24}
            step="0.25"
            defaultValue={initial?.sleepHours}
          />
        </Field>
        {scales.map(([key, label, low, high]) => (
          <fieldset className="scale" key={key}>
            <legend>{label}</legend>
            <div className="scale-options">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n}>
                  <input
                    type="radio"
                    name={key}
                    value={n}
                    required
                    defaultChecked={initial?.[key] === n}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
            <div className="scale-labels">
              <span>1 = {low}</span>
              <span>5 = {high}</span>
            </div>
          </fieldset>
        ))}
        {data.profile?.mentalTracking && (
          <div className="form-grid">
            <Field
              label="Mental fatigue (optional)"
              hint="1 = none · 5 = extreme"
            >
              <select name="mental" defaultValue={initial?.mental ?? ""}>
                <option value="">Not recorded</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Motivation (optional)"
              hint="1 = very low · 5 = excellent"
            >
              <select
                name="motivation"
                defaultValue={initial?.motivation ?? ""}
              >
                <option value="">Not recorded</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Notes (optional)">
          <textarea name="notes" defaultValue={initial?.notes} />
        </Field>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={pain}
            onChange={(e) => setPain(e.target.checked)}
          />
          Add pain or injury symptoms
        </label>
        {pain && (
          <div className="inset">
            <Field label="Body location">
              <input name="location" required placeholder="e.g. Left knee" />
            </Field>
            <div className="form-grid">
              <Field label="Severity (0–10)">
                <input
                  name="severity"
                  type="number"
                  min={0}
                  max={10}
                  required
                />
              </Field>
              <Field label="Symptom trend">
                <select name="trend">
                  <option>Stable</option>
                  <option>Improving</option>
                  <option>Worsening</option>
                </select>
              </Field>
            </div>
            <Field label="During-training response">
              <input name="during" />
            </Field>
            <Field label="Next-day response">
              <input name="nextDay" />
            </Field>
            <Field label="Symptom notes">
              <textarea name="painNotes" />
            </Field>
            <p className="helper">
              Worsening or concerning symptoms deserve an appropriate
              professional assessment. This log does not diagnose an injury.
            </p>
          </div>
        )}
        <ErrorMessage error={s.error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={s.busy}>
            Save check-in
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProfileFields({
  initial,
  onSubmit,
  onboarding = false,
}: {
  initial: Profile;
  onSubmit: (
    profile: Profile,
    tournament?: { name: string; date: string; priority: "A" | "B" | "C" },
  ) => Promise<void>;
  onboarding?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [days, setDays] = useState(initial.preferredDays);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const profile = profileSchema.parse({
        ...initial,
        name: str(f, "name").trim(),
        sport: str(f, "sport"),
        timezone: str(f, "timezone"),
        goals: str(f, "goals"),
        frequency: num(f, "frequency"),
        trainingContext: (str(f, "trainingContext") ||
          undefined) as Profile["trainingContext"],
        contextNotes: str(f, "contextNotes"),
        contextDate:
          str(f, "trainingContext") !== initial.trainingContext
            ? today(initial.timezone)
            : initial.contextDate,
        primaryGoal: (str(f, "primaryGoal") ||
          initial.primaryGoal) as Profile["primaryGoal"],
        preferredDays: days,
        unavailableDates: str(f, "unavailable")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        strengthPriority: str(f, "strengthPriority"),
        conditioningPriority: str(f, "conditioningPriority"),
        windows: {
          A: num(f, "windowA"),
          B: num(f, "windowB"),
          C: num(f, "windowC"),
        },
        adjustMinutes: num(f, "adjustMinutes"),
        postCompetitionDays: num(f, "postCompetitionDays"),
        checkInReminder: f.has("checkInReminder"),
        mentalTracking: f.has("mentalTracking"),
        defaultRpeMode: str(f, "defaultRpeMode"),
        theme: str(f, "theme"),
      });
      const name = str(f, "eventName").trim(),
        date = str(f, "eventDate");
      if (onboarding && ((name && !date) || (!name && date)))
        throw new Error(
          "Enter both a tournament name and date, or leave both empty.",
        );
      await onSubmit(
        profile,
        name && date
          ? { name, date, priority: str(f, "eventPriority") as "A" | "B" | "C" }
          : undefined,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="profile-form">
      <div className="form-grid">
        <Field label="Your name">
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={initial.name}
            placeholder="What should we call you?"
          />
        </Field>
        <Field label="Sport">
          <input name="sport" required defaultValue={initial.sport} />
        </Field>
      </div>
      <Field label="Main training priority">
        <select
          name="primaryGoal"
          defaultValue={initial.primaryGoal ?? "Balanced athletic development"}
        >
          {trainingGoals.map((goal) => (
            <option key={goal}>{goal}</option>
          ))}
        </select>
      </Field>
      <Field label="Training goals">
        <textarea
          name="goals"
          defaultValue={initial.goals}
          placeholder="What are you working toward?"
        />
      </Field>
      <div className="form-grid">
        <Field label="Typical sessions per week">
          <input
            name="frequency"
            type="number"
            min={0}
            max={99}
            required
            defaultValue={initial.frequency}
          />
        </Field>
        <Field label="Timezone">
          <input name="timezone" required defaultValue={initial.timezone} />
        </Field>
      </div>
      <fieldset className="day-picker">
        <legend>Preferred training days</legend>
        <div>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={(e) =>
                  setDays((v) =>
                    e.target.checked ? [...v, i] : v.filter((n) => n !== i),
                  )
                }
              />
              <span>{d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {onboarding && (
        <div className="inset">
          <h3>
            Next competition <span className="muted">(optional)</span>
          </h3>
          <Field label="Tournament name">
            <input name="eventName" placeholder="e.g. National Championships" />
          </Field>
          <div className="form-grid">
            <Field label="Tournament date">
              <input
                type="date"
                name="eventDate"
                min={today(initial.timezone)}
              />
            </Field>
            <Field label="Tournament priority">
              <select name="eventPriority">
                <option value="A">A — Main objective</option>
                <option value="B">B — Important event</option>
                <option value="C">C — Development</option>
              </select>
            </Field>
          </div>
        </div>
      )}
      <details className="details" open={onboarding ? undefined : true}>
        <summary>
          {onboarding
            ? "Fine-tune your preferences (optional)"
            : "Planning and recovery preferences"}
        </summary>
        <Field
          label="Unavailable dates"
          hint="Separate calendar dates with commas, e.g. 2026-11-01, 2026-11-03"
        >
          <input
            name="unavailable"
            defaultValue={initial.unavailableDates.join(", ")}
          />
        </Field>
        <Field label="Strength priority">
          <input
            name="strengthPriority"
            defaultValue={initial.strengthPriority}
          />
        </Field>
        <Field label="Conditioning priority">
          <input
            name="conditioningPriority"
            defaultValue={initial.conditioningPriority}
          />
        </Field>
        <p className="helper">
          Preparation windows are editable product heuristics. These are not
          established fencing-specific prescriptions.
        </p>
        <div className="form-grid three">
          {(["A", "B", "C"] as const).map((k) => (
            <Field key={k} label={`${k} event window (days)`}>
              <input
                type="number"
                name={"window" + k}
                min={0}
                max={k === "A" ? 21 : k === "B" ? 14 : 7}
                required
                defaultValue={initial.windows[k]}
              />
            </Field>
          ))}
        </div>
        <div className="form-grid">
          <Field
            label="Suggested duration reduction (min)"
            hint="Applied only when you accept"
          >
            <input
              name="adjustMinutes"
              type="number"
              min={5}
              max={60}
              defaultValue={initial.adjustMinutes}
              required
            />
          </Field>
          <Field label="Post-event review window (days)">
            <input
              name="postCompetitionDays"
              type="number"
              min={1}
              max={7}
              defaultValue={initial.postCompetitionDays}
              required
            />
          </Field>
        </div>
        <label className="checkbox">
          <input
            name="checkInReminder"
            type="checkbox"
            defaultChecked={initial.checkInReminder}
          />
          Show daily recovery reminder
        </label>
        <label className="checkbox">
          <input
            name="mentalTracking"
            type="checkbox"
            defaultChecked={initial.mentalTracking}
          />
          Include mental fatigue and motivation
        </label>
        <h3>Training logging</h3>
        <Field label="Default RPE input mode">
          <select name="defaultRpeMode" defaultValue={initial.defaultRpeMode}>
            <option value="quick">Quick Mode</option>
            <option value="detailed">Detailed Mode</option>
          </select>
        </Field>
        <Field label="Current training context (optional)">
          <select
            name="trainingContext"
            defaultValue={initial.trainingContext ?? ""}
          >
            <option value="">Not specified</option>
            {trainingContexts.map((context) => (
              <option key={context}>{context}</option>
            ))}
          </select>
        </Field>
        <Field label="Context notes (optional)">
          <textarea name="contextNotes" defaultValue={initial.contextNotes} />
        </Field>
        <Field label="Appearance">
          <select name="theme" defaultValue={initial.theme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">Follow system</option>
          </select>
        </Field>
      </details>
      <ErrorMessage error={error} />
      <div className="form-actions">
        <button className="button primary" disabled={busy}>
          {busy
            ? "Saving…"
            : onboarding
              ? "Start my training plan"
              : "Save profile & preferences"}
        </button>
      </div>
    </form>
  );
}
export { defaultProfile };
