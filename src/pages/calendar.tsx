import { durationLabel } from "../domain/routine";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Plus,
  Trash2,
  Trophy,
  LockKeyhole,
  Check,
  ArrowRight,
} from "lucide-react";
import type { Data, Plan, Session, Tournament } from "../domain/models";
import {
  addDays,
  dateRange,
  daysBetween,
  fmt,
  weekStart,
} from "../domain/dates";
import {
  Badge,
  CategoryIcon,
  categoryClass,
  Empty,
  SectionTitle,
} from "../components/ui";
export function CalendarPage({
  data,
  date,
  initialDate,
  onWorkspace,
  onSkipOccurrence,
  onPlan,
  onTournament,
  onLog,
  onEditSession,
  onDeletePlan,
  onDeleteSession,
  onDeleteTournament,
}: {
  data: Data;
  date: string;
  initialDate?: string;
  onWorkspace: (start?: "week" | "history" | "past") => void;
  onSkipOccurrence: (p: Plan) => void;
  onPlan: (date: string, plan?: Plan) => void;
  onTournament: (date: string, t?: Tournament) => void;
  onLog: (p: Plan) => void;
  onEditSession: (s: Session) => void;
  onDeletePlan: (p: Plan) => void;
  onDeleteSession: (s: Session) => void;
  onDeleteTournament: (t: Tournament) => void;
}) {
  const [anchor, setAnchor] = useState(initialDate ?? date),
    [selected, setSelected] = useState(initialDate ?? date),
    [view, setView] = useState<"Month" | "Week" | "Day">("Month");
  const start =
    view === "Month"
      ? weekStart(anchor.slice(0, 8) + "01")
      : view === "Week"
        ? weekStart(anchor)
        : anchor;
  const days = dateRange(
    start,
    view === "Month" ? 42 : view === "Week" ? 7 : 1,
  );
  const move = (direction: number) => {
    if (view === "Month") {
      const d = new Date(anchor + "T12:00:00Z");
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    } else setAnchor(addDays(anchor, direction * (view === "Week" ? 7 : 1)));
  };
  const tournaments = data.tournaments.filter(
    (t) => t.startDate <= selected && t.endDate >= selected,
  );
  const plans = data.plans.filter((p) => p.date === selected);
  const sessions = data.sessions.filter((s) => s.date === selected);
  return (
    <>
      <div className="schedule-entry-actions">
        <button className="button primary" onClick={() => onWorkspace("week")}>
          Plan Training
        </button>
        <button className="button" onClick={() => onWorkspace("history")}>
          Use My Training History to Plan Ahead
        </button>
        <button className="text-button" onClick={() => onWorkspace("past")}>
          Reconstruct History
        </button>
      </div>
      <div className="calendar-toolbar">
        <div className="row">
          <button
            className="icon-button"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={19} />
          </button>
          <h2>
            {view === "Day"
              ? fmt(anchor, { weekday: "long", day: "numeric", month: "long" })
              : fmt(anchor, { month: "long", year: "numeric" })}
          </h2>
          <button
            className="icon-button"
            aria-label="Next period"
            onClick={() => move(1)}
          >
            <ChevronRight size={19} />
          </button>
          <button
            className="button small"
            onClick={() => {
              setAnchor(date);
              setSelected(date);
            }}
          >
            Today
          </button>
        </div>
        <div className="segmented" aria-label="Calendar view">
          {(["Day", "Week", "Month"] as const).map((v) => (
            <button
              key={v}
              className={v === view ? "active" : ""}
              onClick={() => {
                setView(v);
                if (v === "Day") setAnchor(selected);
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <section className={`panel calendar ${view.toLowerCase()}`}>
        {view !== "Day" && (
          <div className="calendar-head">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        )}
        <div className="calendar-grid">
          {days.map((d) => {
            const ts = data.tournaments.filter(
                (t) => t.startDate <= d && t.endDate >= d,
              ),
              ps = data.plans.filter((p) => p.date === d),
              ss = data.sessions.filter((s) => s.date === d);
            const prep = data.tournaments.filter(
              (t) =>
                t.priority !== "C" &&
                d < t.startDate &&
                d >= addDays(t.startDate, -data.profile!.windows[t.priority]),
            );
            return (
              <button
                key={d}
                aria-label={`View ${d}`}
                className={`calendar-cell ${d === selected ? "selected" : ""} ${d === date ? "today" : ""} ${d.slice(0, 7) !== anchor.slice(0, 7) && view === "Month" ? "outside" : ""}`}
                onClick={() => setSelected(d)}
              >
                <span className="calendar-date">
                  {fmt(d, {
                    day: "numeric",
                    ...(view === "Day" ? { weekday: "long" as const } : {}),
                  })}
                </span>
                {prep.length > 0 && (
                  <span className="prep-mark">
                    {prep[0].priority} preparation
                  </span>
                )}
                {ts.map((t) => (
                  <span key={t.id} className="calendar-event tournament">
                    <Trophy size={11} />
                    {t.priority} · {t.name}
                  </span>
                ))}
                {ps.map((p) => (
                  <span
                    key={p.id}
                    className={`calendar-event ${categoryClass(p.category)} ${p.status === "rest" ? "rest" : ""}`}
                  >
                    <span>
                      {p.status === "completed" ? "✓ " : ""}
                      {p.title}
                    </span>
                    {view !== "Month" && (
                      <small>
                        {p.status === "rest"
                          ? "Rest"
                          : `${p.time || p.timeOfDay || "Any time"} · ${durationLabel(p.duration)}`}
                      </small>
                    )}
                  </span>
                ))}
                {ss
                  .filter((s) => !s.plannedSessionId)
                  .map((s) => (
                    <span
                      key={s.id}
                      className={`calendar-event completed ${categoryClass(s.category)}`}
                    >
                      ✓ {s.title}
                    </span>
                  ))}
              </button>
            );
          })}
        </div>
      </section>
      <div className="calendar-legend">
        {["Fencing", "Strength", "Conditioning", "Mobility", "Competition"].map(
          (c) => (
            <span key={c}>
              <i style={{ background: `var(--${c.toLowerCase()}-color)` }} />
              {c}
            </span>
          ),
        )}
        <span>✓ Completed</span>
        <span>Dashed outline: preparation window</span>
      </div>
      <div className="calendar-detail-grid">
        <section className="panel">
          <SectionTitle
            title={fmt(selected, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            action={
              <button className="button small" onClick={() => onPlan(selected)}>
                <Plus size={15} />
                Plan session
              </button>
            }
          />
          {!plans.length && !sessions.length && !tournaments.length && (
            <Empty
              title="A clear day"
              description="Plan training, protect rest, or add a competition."
            />
          )}
          {tournaments.map((t) => (
            <div className="detail-event" key={t.id}>
              <div className="activity-icon category-competition">
                <Trophy size={19} />
              </div>
              <div className="flex-one">
                <h3>
                  {t.name}{" "}
                  <Badge className={`priority-${t.priority}`}>
                    {t.priority}
                  </Badge>
                </h3>
                <p>
                  {t.location || "Location not set"}
                  {t.results ? " · " + t.results : ""}
                </p>
                {t.goal && <small>{t.goal}</small>}
              </div>
              <button
                className="icon-button"
                aria-label={`Edit ${t.name}`}
                onClick={() => onTournament(selected, t)}
              >
                <Edit2 size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete ${t.name}`}
                onClick={() => onDeleteTournament(t)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {plans.map((p) => (
            <div className="detail-event" key={p.id}>
              <div className={`activity-icon ${categoryClass(p.category)}`}>
                <CategoryIcon category={p.category} />
              </div>
              <div className="flex-one">
                <h3>
                  {p.title} {p.locked && <LockKeyhole size={13} />}
                </h3>
                <p>
                  {p.status === "rest"
                    ? "Rest day"
                    : `${p.time || p.timeOfDay || "Any time"} · ${durationLabel(p.duration)} · ${p.status}`}
                </p>
                {p.notes && <small>{p.notes}</small>}
              </div>
              {p.status === "planned" && p.date <= date && (
                <button
                  className="icon-button"
                  aria-label={`Complete ${p.title}`}
                  onClick={() => onLog(p)}
                >
                  <Check size={17} />
                </button>
              )}
              {p.status !== "completed" && (
                <>
                  {p.seriesId && (
                    <button
                      className="text-button"
                      onClick={() => onSkipOccurrence(p)}
                    >
                      Skip occurrence
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Edit ${p.title}`}
                    onClick={() => onPlan(selected, p)}
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${p.title}`}
                    onClick={() => onDeletePlan(p)}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
          {sessions.map((s) => (
            <div className="detail-event" key={s.id}>
              <div className={`activity-icon ${categoryClass(s.category)}`}>
                <Check size={18} />
              </div>
              <div className="flex-one">
                <h3>{s.title}</h3>
                <p>
                  Completed · {s.durationMinutes} min ·{" "}
                  {s.sessionLoad ?? "Unknown"} AU
                </p>
              </div>
              <button
                className="icon-button"
                aria-label={`Edit completed ${s.title}`}
                onClick={() => onEditSession(s)}
              >
                <Edit2 size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete completed ${s.title}`}
                onClick={() => onDeleteSession(s)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </section>
        <section className="panel">
          <SectionTitle
            title="Competition commitments"
            action={
              <button
                className="icon-button"
                aria-label="Add tournament"
                onClick={() => onTournament(selected)}
              >
                <Plus size={19} />
              </button>
            }
          />
          {data.tournaments.length ? (
            data.tournaments
              .slice()
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .map((t) => (
                <button
                  className="tournament-row"
                  key={t.id}
                  onClick={() => {
                    setSelected(t.startDate);
                    setAnchor(t.startDate);
                  }}
                >
                  <div className="date-block">
                    <span>{fmt(t.startDate, { month: "short" })}</span>
                    <strong>{fmt(t.startDate, { day: "numeric" })}</strong>
                  </div>
                  <div className="flex-one">
                    <h3>{t.name}</h3>
                    <p>
                      {t.endDate < date
                        ? "Completed"
                        : `${Math.max(0, daysBetween(date, t.startDate))} days away`}
                    </p>
                  </div>
                  <Badge className={`priority-${t.priority}`}>
                    {t.priority}
                  </Badge>
                  <ArrowRight size={15} />
                </button>
              ))
          ) : (
            <p className="muted">Your tournaments will appear here.</p>
          )}
        </section>
      </div>
    </>
  );
}
