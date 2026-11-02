import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { db } from "../db";
import { addDays, today } from "../domain/dates";
import {
  identity,
  tournamentSchema,
  trainingGoals,
  trainingContexts,
  type Dataset,
  type SetupDraft,
  type Tournament,
} from "../domain/models";
import { initialSetup } from "../domain/setup";
import { saveSetup } from "../history-storage";
import { ActivityDaySelector } from "./activity-day-selector";
import { Field, ErrorMessage, Modal, Badge } from "./ui";
import { errorText } from "./forms";
export function SetupWizard({
  dataset,
  onDemo,
  onImport,
  onDone,
}: {
  dataset: Dataset;
  onDemo: () => void;
  onImport: () => void;
  onDone: () => void;
}) {
  const stored = useLiveQuery(
    () => db.setup.get(dataset).then((v) => v ?? null),
    [dataset],
  );
  return stored === undefined ? (
    <div className="loading-screen">Opening Quick Start…</div>
  ) : (
    <SetupFlow
      key={dataset}
      initial={stored ?? initialSetup(dataset)}
      onDemo={onDemo}
      onImport={onImport}
      onDone={onDone}
    />
  );
}
function SetupFlow({
  initial,
  onDemo,
  onImport,
  onDone,
}: {
  initial: SetupDraft;
  onDemo: () => void;
  onImport: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [busy, setBusy] = useState(false),
    [event, setEvent] = useState<Tournament | null | undefined>();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  function update(patch: Partial<SetupDraft>) {
    const currentRevision = ++revision.current;
    const next = { ...draft, ...patch, updatedAt: new Date().toISOString() };
    setDraft(next);
    setSaving(true);
    queue.current = queue.current
      .catch(() => {})
      .then(() => db.setup.put(next))
      .then(() => {
        if (currentRevision === revision.current) {
          setSaving(false);
          setError("");
        }
      })
      .catch((e) => {
        if (currentRevision === revision.current) {
          setError(errorText(e));
          setSaving(false);
        }
      });
  }
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [draft.step]);
  async function finish(importAfter = false) {
    setBusy(true);
    try {
      await queue.current;
      await saveSetup(draft, today(draft.timezone));
      onDone();
      if (importAfter) onImport();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setup-shell">
      <header className="setup-header">
        <div className="brand">
          <span className="brand-symbol">
            <Activity size={22} />
          </span>
          <span>
            Athlete<span className="brand-os">OS</span>
          </span>
        </div>
        <span className="setup-saved">
          <ShieldCheck size={15} />
          {saving ? "Saving on this device…" : "Progress saved on this device"}
        </span>
        <button className="text-button" onClick={onDemo}>
          Explore sample athlete
        </button>
      </header>
      <div className="setup-content">
        <nav className="setup-progress" aria-label="Setup progress">
          {["Competitions", "Typical week", "Training objective"].map(
            (label, i) => (
              <button
                key={label}
                aria-current={draft.step === i + 1 ? "step" : undefined}
                className={
                  draft.step === i + 1
                    ? "current"
                    : draft.step > i + 1
                      ? "complete"
                      : ""
                }
                onClick={() => update({ step: i + 1 })}
              >
                <span>{draft.step > i + 1 ? <Check size={14} /> : i + 1}</span>
                {label}
              </button>
            ),
          )}
        </nav>
        <div className="setup-title">
          <h1>
            {draft.step === 1
              ? "When are your upcoming competitions?"
              : draft.step === 2
                ? "Your usual training week"
                : "What is your main training priority?"}
          </h1>
          <p>
            {draft.step === 1
              ? "A few dates help put your training in perspective. You can add or change them later."
              : draft.step === 2
                ? "Select your training days once, then reuse this routine for planning or history."
                : "Choose a direction. Your plan will adapt as you record training and recovery."}
          </p>
        </div>
        {draft.step === 1 && (
          <>
            <div className="setup-name-row">
              <Field label="Your name (optional)">
                <input
                  value={draft.name}
                  placeholder="What should we call you?"
                  maxLength={80}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <details>
                <summary>Timezone: {draft.timezone}</summary>
                <Field label="Timezone">
                  <input
                    value={draft.timezone}
                    onChange={(e) => update({ timezone: e.target.value })}
                  />
                </Field>
              </details>
            </div>
            <div className="setup-events">
              {draft.tournaments.map((t) => (
                <div className="setup-event" key={t.id}>
                  <CalendarDays size={21} />
                  <div>
                    <h3>{t.name}</h3>
                    <p>
                      {t.startDate}
                      {t.endDate !== t.startDate ? " – " + t.endDate : ""}
                    </p>
                  </div>
                  <Badge className={"priority-" + t.priority}>
                    {t.priority} priority
                  </Badge>
                  <button className="text-button" onClick={() => setEvent(t)}>
                    Edit
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${t.name}`}
                    onClick={() =>
                      update({
                        tournaments: draft.tournaments.filter(
                          (v) => v.id !== t.id,
                        ),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button className="button" onClick={() => setEvent(null)}>
              <Plus size={17} />
              Add competition
            </button>
            <div className="priority-guide">
              <p>
                <strong>A · Main competition</strong>Aim to peak; review
                accumulated fatigue before the event.
              </p>
              <p>
                <strong>B · Important competition</strong>Balance performance
                and continued development.
              </p>
              <p>
                <strong>C · Development competition</strong>Usually preserve
                training without a full taper.
              </p>
            </div>
          </>
        )}
        {draft.step === 2 && (
          <>
            <ActivityDaySelector
              context="onboarding"
              rules={draft.rules}
              restDays={draft.restDays}
              unavailableDays={draft.unavailableDays}
              onChange={(rules, restDays, unavailableDays) =>
                update({ rules, restDays, unavailableDays })
              }
            />
            <div className="setup-import-option">
              <span>Already have a training calendar or spreadsheet?</span>
              <button
                className="text-button"
                onClick={() => update({ step: 3, importAfterSetup: true })}
              >
                Import existing training instead
              </button>
            </div>
          </>
        )}
        {draft.step === 3 && (
          <>
            <div
              className="goal-choices"
              role="radiogroup"
              aria-label="Main training priority"
            >
              {trainingGoals.map((goal) => (
                <button
                  role="radio"
                  aria-checked={draft.primaryGoal === goal}
                  className={draft.primaryGoal === goal ? "selected" : ""}
                  key={goal}
                  onClick={() =>
                    update({
                      primaryGoal: goal,
                      secondaryGoals: draft.secondaryGoals.filter(
                        (g) => g !== goal,
                      ),
                    })
                  }
                >
                  <span className="choice-indicator">
                    {draft.primaryGoal === goal && <Check size={14} />}
                  </span>
                  {goal}
                </button>
              ))}
            </div>
            <details className="details">
              <summary>Secondary goals (optional)</summary>
              {trainingGoals
                .filter((g) => g !== draft.primaryGoal)
                .map((goal) => (
                  <label className="checkbox" key={goal}>
                    <input
                      type="checkbox"
                      checked={draft.secondaryGoals.includes(goal)}
                      onChange={(e) =>
                        update({
                          secondaryGoals: e.target.checked
                            ? [...draft.secondaryGoals, goal]
                            : draft.secondaryGoals.filter((g) => g !== goal),
                        })
                      }
                    />
                    {goal}
                  </label>
                ))}
            </details>
            <details className="details">
              <summary>
                Is anything affecting your normal training? (optional)
              </summary>
              <Field label="Current training context">
                <select
                  value={draft.context ?? ""}
                  onChange={(e) =>
                    update({
                      context: e.target.value
                        ? (e.target.value as SetupDraft["context"])
                        : undefined,
                    })
                  }
                >
                  <option value="">Skip / not specified</option>
                  {trainingContexts.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Anything you want to remember? (optional)">
                <textarea
                  value={draft.contextNotes}
                  onChange={(e) => update({ contextNotes: e.target.value })}
                />
              </Field>
              <p className="helper">
                This flags a planning consideration. It does not create a
                recovery measurement or medical diagnosis.
              </p>
            </details>
            <div className="setup-summary">
              <h3>Your starting point</h3>
              <p>
                {draft.tournaments.length
                  ? `${draft.tournaments.length} competition${draft.tournaments.length === 1 ? "" : "s"} in view`
                  : "General training development"}{" "}
                ·{" "}
                {draft.rules.reduce(
                  (n, r) =>
                    n +
                    r.days.filter(
                      (d) =>
                        !draft.restDays.includes(d) &&
                        !draft.unavailableDays.includes(d),
                    ).length,
                  0,
                )}{" "}
                typical sessions per week
              </p>
              <p>No historical workouts, RPE, or recovery check-in required.</p>
            </div>
          </>
        )}
        <ErrorMessage error={error} />
        <div className="setup-actions">
          {draft.step > 1 && (
            <button
              className="button"
              onClick={() => update({ step: draft.step - 1 })}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          {draft.step === 1 && (
            <button
              className="text-button"
              onClick={() => update({ tournaments: [], step: 2 })}
            >
              No upcoming competitions
            </button>
          )}
          {draft.step === 2 && (
            <button className="text-button" onClick={() => update({ step: 3 })}>
              Skip this for now
            </button>
          )}
          <button
            className="button primary"
            disabled={busy || saving}
            onClick={() =>
              draft.step < 3
                ? update({ step: draft.step + 1 })
                : void finish(draft.importAfterSetup)
            }
          >
            {busy
              ? "Creating your workspace…"
              : draft.step === 3
                ? "Start my training plan"
                : "Continue"}
            {draft.step < 3 && <ArrowRight size={16} />}
          </button>
        </div>
        <p className="setup-footnote">
          A few useful details now. More accurate measurements as you train.
        </p>
      </div>
      {event !== undefined && (
        <SetupTournament
          dataset={draft.dataset}
          date={(() => {
            try {
              return today(draft.timezone);
            } catch {
              return today();
            }
          })()}
          initial={event ?? undefined}
          onClose={() => setEvent(undefined)}
          onSave={(t) => {
            update({
              tournaments: event
                ? draft.tournaments.map((v) => (v.id === t.id ? t : v))
                : [...draft.tournaments, t],
            });
            setEvent(undefined);
          }}
        />
      )}
    </div>
  );
}
function SetupTournament({
  dataset,
  date,
  initial,
  onClose,
  onSave,
}: {
  dataset: Dataset;
  date: string;
  initial?: Tournament;
  onClose: () => void;
  onSave: (t: Tournament) => void;
}) {
  const [error, setError] = useState("");
  return (
    <Modal
      title={initial ? "Edit competition" : "Add competition"}
      description="A name is optional. The dates and priority shape your plan."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            onSave(
              tournamentSchema.parse({
                ...identity(dataset, initial?.id),
                ...initial,
                name: String(f.get("name")).trim() || "Competition",
                startDate: String(f.get("start")),
                endDate: String(f.get("end")),
                priority: String(f.get("priority")),
                location: initial?.location ?? "",
                notes: initial?.notes ?? "",
                goal: initial?.goal ?? "",
                results: initial?.results ?? "",
              }),
            );
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        <Field label="Competition name (optional)">
          <input name="name" maxLength={150} defaultValue={initial?.name} />
        </Field>
        <div className="form-grid">
          <Field label="Start date">
            <input
              type="date"
              name="start"
              defaultValue={initial?.startDate ?? addDays(date, 14)}
              required
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              name="end"
              defaultValue={initial?.endDate ?? addDays(date, 14)}
              required
            />
          </Field>
        </div>
        <Field label="Competition priority">
          <select name="priority" defaultValue={initial?.priority ?? "B"}>
            <option value="A">A — Main competition, aim to peak</option>
            <option value="B">B — Balance performance and development</option>
            <option value="C">C — Development, usually no full taper</option>
          </select>
        </Field>
        <ErrorMessage error={error} />
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Save competition</button>
        </div>
      </form>
    </Modal>
  );
}
