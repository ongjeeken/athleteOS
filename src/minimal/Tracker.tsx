import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Dumbbell,
  Ellipsis,
  Flag,
  Footprints,
  House,
  Leaf,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Swords,
  Undo2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { addDays, daysBetween, fmt, today, weekStart } from "../domain/dates";
import {
  effortIntensity,
  intensities,
  kinds,
  labels,
  shortLabels,
  uid,
  weekdays,
} from "./model";
import type {
  Competition,
  CompetitionPriority,
  Effort,
  Kind,
  Session,
  Template,
  TrackerData,
} from "./model";
import {
  changeRoutine,
  materialize,
  openWeek,
  sessionsInWeek,
  sessionsOn,
  weekDays,
} from "./schedule";
import { observe } from "./observations";
import { changeCompetition, refreshIntensityPlan } from "./intensity";
import { SessionIntensity } from "./session-intensity";
import { dailyDemand } from "./daily-demand";
import { DailyDemandBadge, TodayDemand } from "./daily-demand-ui";
import {
  DRAFT_KEY,
  readData,
  readDraft,
  saveData,
  STORAGE_KEY,
} from "./storage";
import "./tracker.css";

const icons: Record<Kind, LucideIcon> = {
  fencing: Swords,
  strength: Dumbbell,
  conditioning: Footprints,
  recovery: Leaf,
  other: Ellipsis,
};
const efforts: Effort[] = [...intensities];
function Brand({ onHome }: { onHome?: () => void }) {
  const content = (
    <>
      <Swords size={23} strokeWidth={1.6} />
      <span>
        Athlete<span className="brand-os">OS</span>
      </span>
    </>
  );
  return onHome ? (
    <button className="brand" onClick={onHome} aria-label="AthleteOS home">
      {content}
    </button>
  ) : (
    <div className="brand">{content}</div>
  );
}
function TypeIcon({ kind, size = 21 }: { kind: Kind; size?: number }) {
  const Icon = icons[kind];
  return <Icon size={size} strokeWidth={1.7} />;
}
function TypePicker({
  value,
  onChange,
}: {
  value: Kind;
  onChange: (kind: Kind) => void;
}) {
  return (
    <div className="type-picker" aria-label="Training type">
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          className={`type-choice ${kind} ${value === kind ? "selected" : ""}`}
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
        >
          <TypeIcon kind={kind} size={18} />
          {labels[kind]}
        </button>
      ))}
    </div>
  );
}
function RoutineBuilder({
  templates,
  onChange,
}: {
  templates: Template[];
  onChange: (value: Template[]) => void;
}) {
  const [kind, setKind] = useState<Kind>("fencing");
  return (
    <div className="routine-builder">
      <TypePicker value={kind} onChange={setKind} />
      <p className="builder-help">
        Choose a type, then tap the days you train. Tap again for a second
        session.
      </p>
      <div className="routine-days">
        {weekdays.map((day, index) => (
          <div className="routine-day" key={day}>
            <button
              type="button"
              className="day-add"
              aria-label={`Add ${labels[kind]} on ${day}`}
              onClick={() =>
                onChange([...templates, { id: uid(), kind, day: index }])
              }
            >
              <span className="day-full">{day}</span>
              <span className="day-short">{day.slice(0, 3)}</span>
              <Plus size={16} />
            </button>
            <div className="routine-entries">
              {templates
                .filter((t) => t.day === index)
                .map((t) => (
                  <button
                    type="button"
                    className={`session-chip ${t.kind}`}
                    key={t.id}
                    aria-label={`Remove ${labels[t.kind]} on ${day}`}
                    onClick={() =>
                      onChange(templates.filter((x) => x.id !== t.id))
                    }
                  >
                    <span className="type-dot" />
                    {shortLabels[t.kind]}
                    <X size={13} />
                  </button>
                ))}
              {!templates.some((t) => t.day === index) && (
                <span className="open-day">Leave open</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="routine-total">
        <span>
          {templates.length} session{templates.length === 1 ? "" : "s"} in your
          usual week
        </span>
        <span>Adjust any time</span>
      </div>
    </div>
  );
}

function CompetitionFields({
  date,
  name,
  onDate,
  onName,
  priority,
  onPriority,
  minimum,
}: {
  date: string;
  name: string;
  onDate: (d: string) => void;
  onName: (n: string) => void;
  priority: CompetitionPriority;
  onPriority: (priority: CompetitionPriority) => void;
  minimum?: string;
}) {
  return (
    <div className="competition-fields">
      <label>
        Competition date
        <input
          type="date"
          value={date}
          min={minimum}
          required
          onChange={(e) => onDate(e.target.value)}
        />
      </label>
      <label>
        Competition name <span className="optional">optional</span>
        <input
          type="text"
          value={name}
          maxLength={120}
          placeholder="e.g. Singapore Open"
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      <fieldset className="competition-priority">
        <legend>
          Competition priority <span className="optional">optional</span>
        </legend>
        <div>
          {(["regular", "priority"] as const).map((value) => (
            <label key={value} className={priority === value ? "selected" : ""}>
              <input
                type="radio"
                name="competition-priority"
                value={value}
                checked={priority === value}
                onChange={() => onPriority(value)}
              />
              {value === "regular"
                ? "Regular competition"
                : "Priority competition"}
            </label>
          ))}
        </div>
        <p>
          {priority === "regular"
            ? "Keep normal training earlier; ease the demand close to the event."
            : "Take a more cautious approach in the final few days."}
        </p>
      </fieldset>
    </div>
  );
}
function Onboarding({
  onDone,
  error,
}: {
  onDone: (templates: Template[], competition?: Competition) => boolean;
  error: string;
}) {
  const [draft, setDraft] = useState(readDraft);
  const [draftError, setDraftError] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftError("");
    } catch {
      setDraftError(
        "Setup could not be saved. Check that browser storage is available.",
      );
    }
  }, [draft]);
  const finish = (skip: boolean) => {
    if (
      onDone(
        draft.templates,
        skip
          ? undefined
          : {
              date: draft.date,
              name: draft.name.trim(),
              priority: draft.priority ?? "regular",
            },
      )
    ) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* Completed data already saved. */
      }
    }
  };
  return (
    <div className="tracker setup-shell">
      <header className="setup-header">
        <Brand />
        <span className="private-label">
          <ShieldCheck size={15} /> Just on your device
        </span>
      </header>
      <main className="setup-content">
        <div className="setup-progress" aria-label={`Step ${draft.step} of 2`}>
          <span className={draft.step === 1 ? "active" : "done"}>
            {draft.step === 2 ? <Check size={13} /> : "1"}
            <span>Your routine</span>
          </span>
          <i />
          <span className={draft.step === 2 ? "active" : ""}>
            2<span>Next competition</span>
          </span>
        </div>
        {draft.step === 1 ? (
          <>
            <div className="setup-heading">
              <h1>
                A little routine.
                <br />A clearer week.
              </h1>
              <p>
                What does your typical training week look like?
                <br className="desktop-break" /> Start with the sessions you
                usually do.
              </p>
            </div>
            <RoutineBuilder
              templates={draft.templates}
              onChange={(templates) => setDraft({ ...draft, templates })}
            />
            <div className="setup-actions">
              <span>No details needed. Just your days.</span>
              <button
                className="button primary"
                onClick={() => setDraft({ ...draft, step: 2 })}
              >
                Continue <ArrowRight size={17} />
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              className="text-button back-button"
              onClick={() => setDraft({ ...draft, step: 1 })}
            >
              <ArrowLeft size={16} /> Your routine
            </button>
            <div className="setup-heading">
              <h1>
                Something on
                <br />
                the horizon?
              </h1>
              <p>
                Your next competition helps put the week in perspective.
                <br className="desktop-break" /> You can always add it later.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                finish(false);
              }}
            >
              <CompetitionFields
                date={draft.date}
                name={draft.name}
                onDate={(date) => setDraft({ ...draft, date })}
                onName={(name) => setDraft({ ...draft, name })}
                priority={draft.priority ?? "regular"}
                onPriority={(priority) => setDraft({ ...draft, priority })}
                minimum={today()}
              />
              <div className="setup-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => finish(true)}
                >
                  Skip for now
                </button>
                <button className="button primary" type="submit">
                  See my week <ArrowRight size={17} />
                </button>
              </div>
            </form>
          </>
        )}
        {(error || draftError) && (
          <p role="alert" className="error-message">
            {error || draftError}
          </p>
        )}
        <p className="setup-footnote">
          Less time tracking. More time on the piste.
        </p>
      </main>
      <footer className="setup-footer">
        <span>Made for the rhythm of fencing.</span>
        <span>No account. No subscription.</span>
      </footer>
    </div>
  );
}

function WeekStrip({
  data,
  date,
  active,
  onSelect,
}: {
  data: TrackerData;
  date: string;
  active?: string;
  onSelect: (day: string) => void;
}) {
  const now = today();
  return (
    <div
      className="week-strip daily-overview"
      aria-label="Training week, daily demand"
    >
      {weekDays(date).map((day) => {
        const sessions = sessionsOn(data, day);
        const demand = dailyDemand(data, day);
        const comp = data.competition?.date === day;
        const sessionNames = sessions
          .map(
            (s) =>
              `; ${labels[s.kind]}${s.recommendation ? ` planned ${s.intensityOverride ?? s.recommendation.level}${s.intensityOverride ? `, suggested ${s.recommendation.level}` : ""}` : ", no suggestion recorded"}${s.status === "completed" ? `, completed, actual ${effortIntensity(s.effort)}` : s.status === "skipped" ? ", skipped" : ""}`,
          )
          .join("");
        return (
          <button
            key={day}
            className={`strip-day ${active === day ? "selected" : ""} ${day === now ? "is-today" : ""}`}
            onClick={() => onSelect(day)}
            aria-label={`${fmt(day, { weekday: "long", day: "numeric", month: "long" })}, daily demand ${demand.level}, ${sessions.length} sessions${comp ? ", competition" : ""}${sessionNames}`}
            aria-current={day === now ? "date" : undefined}
          >
            <span>{fmt(day, { weekday: "short" })}</span>
            <strong>{fmt(day, { day: "numeric" })}</strong>
            <DailyDemandBadge demand={demand} />
            {comp && (
              <span className="strip-competition">
                <Flag size={11} />
                Competition
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
function ObservationPanel({
  data,
  start,
  date,
}: {
  data: TrackerData;
  start: string;
  date: string;
}) {
  const insight = observe(data, start, date);
  return (
    <section className="observation" aria-label="Weekly intensity strategy">
      <div className="observation-heading">
        <Leaf size={17} />
        <h2>{insight.title}</h2>
      </div>
      <p>{insight.text}</p>
      <details>
        <summary>How the plan works</summary>
        <p>
          {insight.reason} These are adjustable starting points, not a measure
          of fatigue or readiness. Intensity means something different for each
          activity.
        </p>
      </details>
    </section>
  );
}
function CompetitionPanel({
  competition,
  onEdit,
  date,
}: {
  competition?: Competition;
  onEdit: () => void;
  date: string;
}) {
  const difference = competition ? daysBetween(date, competition.date) : 0;
  return (
    <section className="competition-panel" aria-label="Next competition">
      <div className="competition-heading">
        <Flag size={16} />
        <h2>
          {competition
            ? competition.name || "Competition day"
            : "Your next competition"}
        </h2>
      </div>
      {competition ? (
        <>
          <p>
            {fmt(competition.date, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            <span className="competition-count">
              {competition.priority === "priority"
                ? "Priority competition"
                : "Regular competition"}{" "}
              ·{" "}
              {difference > 0
                ? `In ${difference} day${difference === 1 ? "" : "s"}`
                : difference === 0
                  ? "Today"
                  : `${Math.abs(difference)} days ago`}
            </span>
          </p>
          <button className="text-button" onClick={onEdit}>
            Edit competition <ArrowRight size={14} />
          </button>
        </>
      ) : (
        <>
          <p>Have a competition coming up? Add the date when you know it.</p>
          <button className="text-button" onClick={onEdit}>
            Add competition <Plus size={14} />
          </button>
        </>
      )}
    </section>
  );
}

function SessionEditor({
  session,
  onSave,
  onCancel,
  onRemove,
}: {
  session: Session;
  onSave: (s: Session) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(session);
  return (
    <form
      className="inline-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, modified: true });
      }}
    >
      <div className="editor-fields">
        <label>
          Session type
          <select
            value={draft.kind}
            onChange={(e) =>
              setDraft({ ...draft, kind: e.target.value as Kind })
            }
          >
            {kinds.map((k) => (
              <option value={k} key={k}>
                {labels[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            required
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>
      </div>
      <label>
        Notes <span className="optional">optional</span>
        <textarea
          rows={2}
          maxLength={2000}
          placeholder="Anything you want to remember"
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
      </label>
      <p className="editor-note">Changes apply to this session only.</p>
      <div className="editor-actions">
        <button type="button" className="text-button danger" onClick={onRemove}>
          Remove session
        </button>
        <div>
          <button type="button" className="button quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save changes
          </button>
        </div>
      </div>
    </form>
  );
}
function SessionRow({
  session,
  onUpdate,
  onUndoRemove,
  date,
  compact = false,
}: {
  session: Session;
  onUpdate: (value: Session) => boolean;
  onUndoRemove: (value: Session) => void;
  date: string;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState(false);
  const isFuture = session.date > date;
  const log = (effort: Effort) => {
    if (onUpdate({ ...session, status: "completed", effort, modified: true }))
      setChanging(false);
  };
  return (
    <article
      className={`session-row ${session.status}`}
      aria-label={`${labels[session.kind]} session`}
    >
      <div className="session-top">
        <span className={`activity-icon ${session.kind}`}>
          <TypeIcon kind={session.kind} />
        </span>
        <div className="session-title">
          <h3>{labels[session.kind]}</h3>
          <p
            className={
              session.status === "completed"
                ? `actual-effort-${effortIntensity(session.effort)?.toLowerCase()}`
                : undefined
            }
          >
            {session.status === "completed" ? (
              <>
                <CircleCheck size={13} /> Completed · Actual:{" "}
                {effortIntensity(session.effort)}
              </>
            ) : session.status === "skipped" ? (
              "Skipped"
            ) : session.templateId ? (
              "From your routine"
            ) : (
              "One-off session"
            )}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={() => setEditing(!editing)}
          aria-expanded={editing}
          aria-label={`Edit ${labels[session.kind]} session`}
        >
          {editing ? <X size={19} /> : <Ellipsis size={22} />}
        </button>
      </div>
      <SessionIntensity
        session={session}
        date={date}
        compact={compact}
        onUpdate={onUpdate}
      />
      {((session.status === "planned" && !compact) || changing) &&
        !isFuture && (
          <div className="log-controls">
            <p>How hard was it actually?</p>
            <div className="effort-buttons">
              {efforts.map((effort) => (
                <button
                  key={effort}
                  className={`effort intensity-${effort.toLowerCase()} ${effortIntensity(session.effort) === effort ? "chosen" : ""}`}
                  aria-pressed={effortIntensity(session.effort) === effort}
                  onClick={() => log(effort)}
                >
                  {effort}
                </button>
              ))}
            </div>
          </div>
        )}
      {!editing && (
        <div className="session-bottom">
          {compact && session.status === "planned" && !isFuture ? (
            <button
              className="text-button"
              onClick={() => setChanging(!changing)}
            >
              {changing ? "Close logging" : "Log session"}
            </button>
          ) : (
            <button className="text-button" onClick={() => setEditing(true)}>
              {compact
                ? "Edit session"
                : session.notes
                  ? "View details"
                  : "Add details"}
            </button>
          )}
          <div>
            {session.status === "planned" ? (
              <button
                className="text-button"
                onClick={() =>
                  onUpdate({
                    ...session,
                    status: "skipped",
                    effort: undefined,
                    modified: true,
                  })
                }
              >
                Skip session
              </button>
            ) : (
              <>
                {session.status === "completed" && (
                  <button
                    className="text-button"
                    onClick={() => setChanging(!changing)}
                  >
                    {changing ? "Done" : "Change effort"}
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    onUpdate({
                      ...session,
                      status: "planned",
                      effort: undefined,
                      modified: true,
                    });
                    setChanging(false);
                  }}
                >
                  <Undo2 size={13} /> Undo
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {editing && (
        <SessionEditor
          session={session}
          onCancel={() => setEditing(false)}
          onSave={(value) => {
            if (onUpdate(value)) setEditing(false);
          }}
          onRemove={() => {
            if (onUpdate({ ...session, removed: true, modified: true }))
              onUndoRemove(session);
          }}
        />
      )}
    </article>
  );
}

function AddSession({
  initialDate,
  onAdd,
  onCancel,
}: {
  initialDate: string;
  onAdd: (kind: Kind, date: string) => boolean;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>("fencing");
  const [date, setDate] = useState(initialDate);
  return (
    <form
      className="add-session-form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(kind, date);
      }}
    >
      <div className="section-heading">
        <h3>Add a session</h3>
        <button
          className="icon-button"
          type="button"
          onClick={onCancel}
          aria-label="Cancel adding session"
        >
          <X size={19} />
        </button>
      </div>
      <TypePicker value={kind} onChange={setKind} />
      <div className="add-session-bottom">
        <label>
          Date
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button className="button primary" type="submit">
          <Plus size={16} /> Add session
        </button>
      </div>
    </form>
  );
}

export default function Tracker() {
  const [date, setDate] = useState(() => today());
  const [data, setData] = useState<TrackerData | null>(() => {
    const saved = readData();
    return saved
      ? refreshIntensityPlan(openWeek(saved, today(), today()), today())
      : null;
  });
  const current = useRef(data);
  const [page, setPage] = useState<"today" | "week">("today");
  const [week, setWeek] = useState(() => weekStart(today()));
  const [welcome, setWelcome] = useState(false);
  const [editor, setEditor] = useState<"routine" | "competition" | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    restore?: Session;
  } | null>(null);
  function commit(next: TrackerData): boolean {
    try {
      const prepared = refreshIntensityPlan(next, date);
      saveData(prepared);
      current.current = prepared;
      setData(prepared);
      setError("");
      return true;
    } catch {
      setError(
        "Your change could not be saved. Check that browser storage has space, then try again.",
      );
      return false;
    }
  }
  useEffect(() => {
    if (current.current) commit(current.current);
    const updateDate = () => setDate(today());
    const interval = setInterval(updateDate, 30_000);
    window.addEventListener("focus", updateDate);
    function sync(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        const saved = readData();
        const next = saved
          ? refreshIntensityPlan(openWeek(saved, today(), today()), today())
          : null;
        current.current = next;
        setData(next);
      } catch {
        setError(
          "Training changed in another tab but could not be read. Reload to try again.",
        );
      }
    }
    window.addEventListener("storage", sync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", updateDate);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (current.current) commit(openWeek(current.current, date, date));
  }, [date]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  function updateSession(value: Session) {
    const latest = current.current!;
    return commit({
      ...latest,
      sessions: latest.sessions.map((s) => (s.id === value.id ? value : s)),
    });
  }
  function navigate(next: "today" | "week") {
    setPage(next);
    setWelcome(false);
    setEditor(null);
    setAdding(null);
    if (next === "week") selectWeek(date);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function selectWeek(value: string) {
    if (commit(openWeek(current.current!, value, date))) {
      setWeek(weekStart(value));
      setAdding(null);
    }
  }
  if (!data)
    return (
      <Onboarding
        error={error}
        onDone={(templates, competition) => {
          const next = refreshIntensityPlan(
            materialize(
              {
                version: 1,
                startedOn: weekStart(date),
                templates,
                sessions: [],
                competition,
              },
              weekStart(date),
            ),
            date,
          );
          if (!commit(next)) return false;
          const upcoming = next.sessions
            .filter((s) => s.date >= date && !s.removed)
            .sort((a, b) => a.date.localeCompare(b.date))[0];
          if (upcoming) setWeek(weekStart(upcoming.date));
          setPage("week");
          setWelcome(true);
          window.scrollTo({ top: 0, behavior: "instant" });
          return true;
        }}
      />
    );
  const shownWeek = page === "today" ? weekStart(date) : week;
  const weeklySessions = sessionsInWeek(data, shownWeek);
  const completed = weeklySessions.filter(
    (s) => s.status === "completed",
  ).length;
  const daySessions = sessionsOn(data, date);
  return (
    <div className="tracker">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <div className="header-inner">
          <Brand onHome={() => navigate("today")} />
          <nav aria-label="Main navigation">
            <button
              className={page === "today" && !editor ? "active" : ""}
              aria-current={page === "today" && !editor ? "page" : undefined}
              onClick={() => navigate("today")}
            >
              <House size={17} /> Today
            </button>
            <button
              className={page === "week" && !editor ? "active" : ""}
              aria-current={page === "week" && !editor ? "page" : undefined}
              onClick={() => navigate("week")}
            >
              <CalendarDays size={17} /> Week
            </button>
          </nav>
          <button
            className="routine-link"
            onClick={() => {
              setEditor("routine");
              setAdding(null);
            }}
          >
            <SlidersHorizontal size={17} />
            <span>Your routine</span>
          </button>
        </div>
      </header>
      <main className="workspace" id="main-content">
        {error && (
          <div role="alert" className="error-message">
            {error}
            <button className="text-button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
        {editor === "routine" ? (
          <RoutineSettings
            data={data}
            date={date}
            onCancel={() => setEditor(null)}
            onSave={(templates) => {
              if (commit(changeRoutine(current.current!, templates, date))) {
                setEditor(null);
                setNotice({
                  text: "Routine updated. Your logged and edited sessions are kept.",
                });
              }
            }}
          />
        ) : editor === "competition" ? (
          <CompetitionSettings
            competition={data.competition}
            date={date}
            onCancel={() => setEditor(null)}
            onSave={(competition) => {
              if (
                commit(changeCompetition(current.current!, competition, date))
              ) {
                setEditor(null);
                setNotice({
                  text: competition
                    ? "Competition saved."
                    : "Competition removed.",
                });
              }
            }}
          />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <h1>
                  {welcome
                    ? "Your intensity plan is ready."
                    : page === "today"
                      ? "Today’s training."
                      : "Your training week."}
                </h1>
                <p>
                  {welcome
                    ? "How hard to go, within the days you already train."
                    : page === "today"
                      ? fmt(date, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "Your daily demand, with guidance for each session."}
                </p>
              </div>
              {welcome ? (
                <button
                  className="button primary"
                  onClick={() => navigate("today")}
                >
                  Go to today <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="button secondary heading-add"
                  onClick={() =>
                    setAdding(
                      adding ? null : page === "today" ? date : shownWeek,
                    )
                  }
                >
                  <Plus size={17} /> Add session
                </button>
              )}
            </div>
            <div
              className={`content-layout ${page === "week" ? "week-layout" : ""}`}
            >
              <div className="main-column">
                {page === "week" && (
                  <div className="week-topline">
                    <div>
                      <span>
                        {fmt(shownWeek, { day: "numeric", month: "short" })} –{" "}
                        {fmt(addDays(shownWeek, 6), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {shownWeek === weekStart(date) && (
                        <small>This week</small>
                      )}
                    </div>
                    {page === "week" ? (
                      <div className="week-controls">
                        <button
                          className="icon-button"
                          aria-label="Previous week"
                          onClick={() => selectWeek(addDays(week, -7))}
                        >
                          <ChevronLeft size={19} />
                        </button>
                        {week !== weekStart(date) && (
                          <button
                            className="text-button"
                            onClick={() => selectWeek(date)}
                          >
                            This week
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label="Next week"
                          onClick={() => selectWeek(addDays(week, 7))}
                        >
                          <ChevronRight size={19} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => navigate("week")}
                      >
                        View week <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}
                {page === "today" ? (
                  <TodayDemand demand={dailyDemand(data, date)} />
                ) : (
                  <>
                    <WeekStrip
                      data={data}
                      date={shownWeek}
                      onSelect={(day) => {
                        requestAnimationFrame(() =>
                          document
                            .getElementById(`day-${day}`)
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            }),
                        );
                      }}
                    />
                    <p className="daily-plan-note">
                      Daily demand is a provisional relative plan, not a
                      workload measurement.
                    </p>
                  </>
                )}
                {adding && (
                  <AddSession
                    key={adding}
                    initialDate={adding}
                    onCancel={() => setAdding(null)}
                    onAdd={(kind, when) => {
                      const next = {
                        ...current.current!,
                        sessions: [
                          ...current.current!.sessions,
                          {
                            id: uid(),
                            date: when,
                            originalDate: when,
                            kind,
                            status: "planned" as const,
                            modified: true,
                          },
                        ],
                      };
                      if (!commit(openWeek(next, when, date))) return false;
                      if (when !== date) {
                        setPage("week");
                        setWeek(weekStart(when));
                      }
                      setAdding(null);
                      setNotice({ text: "Session added." });
                      return true;
                    }}
                  />
                )}
                {page === "today" ? (
                  <section className="today-sessions">
                    <div className="section-heading">
                      <h2>
                        {daySessions.length
                          ? "On your schedule"
                          : "A little breathing room."}
                      </h2>
                      {daySessions.length > 0 && (
                        <span>
                          {daySessions.length} session
                          {daySessions.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {daySessions.length ? (
                      <>
                        <p className="section-description">
                          One tap to log what you actually did.
                        </p>
                        {daySessions.map((session) => (
                          <SessionRow
                            session={session}
                            key={session.id}
                            date={date}
                            onUpdate={updateSession}
                            onUndoRemove={(s) =>
                              setNotice({
                                text: "Session removed.",
                                restore: s,
                              })
                            }
                          />
                        ))}
                        <button
                          className="add-inline"
                          onClick={() => setAdding(date)}
                        >
                          <Plus size={17} /> Add an unscheduled session
                        </button>
                      </>
                    ) : (
                      <div className="rest-state">
                        <Leaf size={33} strokeWidth={1.3} />
                        <p>
                          No sessions planned for today.
                          <br />
                          Keep the space, or add a session if plans change.
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => setAdding(date)}
                        >
                          <Plus size={17} /> Add a session
                        </button>
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="week-agenda">
                    <div className="section-heading">
                      <h2>Day by day</h2>
                      <span>
                        {completed} of {weeklySessions.length} completed
                      </span>
                    </div>
                    <p className="section-description">
                      Daily demand first; individual session guidance below.
                    </p>
                    {weekDays(shownWeek).map((day) => (
                      <div
                        className={`agenda-day ${day === date ? "today" : ""}`}
                        id={`day-${day}`}
                        key={day}
                      >
                        <div className="agenda-date">
                          <div>
                            <h3>
                              {fmt(day, { weekday: "long" })}
                              <span>
                                {fmt(day, { day: "numeric", month: "short" })}
                              </span>
                              {day === date && <small>Today</small>}
                            </h3>
                          </div>
                          <div className="agenda-day-actions">
                            <DailyDemandBadge
                              demand={dailyDemand(data, day)}
                              explain
                              day={fmt(day, { weekday: "long" })}
                            />
                            <button
                              className="icon-button"
                              aria-label={`Add session on ${fmt(day, { weekday: "long" })}`}
                              onClick={() => setAdding(day)}
                            >
                              <Plus size={17} />
                            </button>
                          </div>
                        </div>
                        {data.competition?.date === day && (
                          <div className="competition-event">
                            <Flag size={16} />
                            <strong>
                              {data.competition.name || "Competition day"}
                            </strong>
                          </div>
                        )}
                        {sessionsOn(data, day).length ? (
                          sessionsOn(data, day).map((session) => (
                            <SessionRow
                              compact
                              session={session}
                              key={session.id}
                              date={date}
                              onUpdate={updateSession}
                              onUndoRemove={(s) =>
                                setNotice({
                                  text: "Session removed.",
                                  restore: s,
                                })
                              }
                            />
                          ))
                        ) : (
                          <p className="agenda-rest">
                            {day < data.startedOn
                              ? "No sessions recorded"
                              : "No training planned"}
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                )}
              </div>
              <aside className="side-column">
                <ObservationPanel data={data} start={shownWeek} date={date} />
                <CompetitionPanel
                  competition={data.competition}
                  date={date}
                  onEdit={() => setEditor("competition")}
                />
                <div className="routine-note">
                  <SlidersHorizontal size={18} />
                  <div>
                    <p>Different week, same starting point.</p>
                    <button
                      className="text-button"
                      onClick={() => setEditor("routine")}
                    >
                      Edit your usual routine <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
      <footer className="app-footer">
        <span>
          <ShieldCheck size={14} /> Saved in this browser
        </span>
        <span>Your training. At your pace.</span>
      </footer>
      {notice && (
        <div role="status" className="toast">
          <CircleCheck size={17} />
          <span>{notice.text}</span>
          {notice.restore && (
            <button
              onClick={() => {
                if (updateSession(notice.restore!)) setNotice(null);
              }}
            >
              Undo
            </button>
          )}
          <button aria-label="Dismiss message" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function RoutineSettings({
  data,
  date,
  onSave,
  onCancel,
}: {
  data: TrackerData;
  date: string;
  onSave: (templates: Template[]) => void;
  onCancel: () => void;
}) {
  const [templates, setTemplates] = useState(data.templates);
  return (
    <section className="settings-view">
      <button className="text-button back-button" onClick={onCancel}>
        <ArrowLeft size={16} /> Back to training
      </button>
      <div className="page-heading">
        <div>
          <h1>Your usual routine.</h1>
          <p>
            A starting point for each week. Adjust individual sessions in Week.
          </p>
        </div>
      </div>
      <RoutineBuilder templates={templates} onChange={setTemplates} />
      <p className="settings-note">
        Changes apply from {fmt(date, { day: "numeric", month: "long" })}.
        Logged sessions, past days and individual changes are kept.
      </p>
      <div className="settings-actions">
        <button className="button quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" onClick={() => onSave(templates)}>
          Save routine <Check size={17} />
        </button>
      </div>
    </section>
  );
}
function CompetitionSettings({
  competition,
  date,
  onSave,
  onCancel,
}: {
  competition?: Competition;
  date: string;
  onSave: (competition?: Competition) => void;
  onCancel: () => void;
}) {
  const [when, setWhen] = useState(competition?.date ?? "");
  const [name, setName] = useState(competition?.name ?? "");
  const [priority, setPriority] = useState<CompetitionPriority>(
    competition?.priority ?? "regular",
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({ date: when, name: name.trim(), priority });
  }
  return (
    <section className="settings-view competition-settings">
      <button className="text-button back-button" onClick={onCancel}>
        <ArrowLeft size={16} /> Back to training
      </button>
      <div className="page-heading">
        <div>
          <h1>Your next competition.</h1>
          <p>One date to help put your week in perspective.</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <CompetitionFields
          date={when}
          name={name}
          onDate={setWhen}
          onName={setName}
          priority={priority}
          onPriority={setPriority}
          minimum={competition ? undefined : date}
        />
        <div className="settings-actions">
          {competition && (
            <button
              type="button"
              className="text-button danger"
              onClick={() => onSave(undefined)}
            >
              Remove competition
            </button>
          )}
          <button type="button" className="button quiet" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Save competition <Check size={17} />
          </button>
        </div>
      </form>
    </section>
  );
}
