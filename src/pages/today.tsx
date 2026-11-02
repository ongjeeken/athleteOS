import { durationLabel } from "../domain/routine";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { Data, Plan } from "../domain/models";
import {
  PLANNER_VERSION,
  type PlanningResult,
  type Suggestion,
} from "../domain/planner";
import { addDays, daysBetween, fmt, weekStart } from "../domain/dates";
import { baseline, workload, workloadLabel } from "../domain/analytics";
import {
  Badge,
  CategoryIcon,
  categoryClass,
  Empty,
  SectionTitle,
} from "../components/ui";
import { LoadChart } from "../components/charts";
export function TodayPage({
  data,
  date,
  planning,
  onLog,
  onCheckIn,
  onPlan,
  onCalendar,
  onInsights,
  onApply,
  onDismiss,
  onOverride,
}: {
  data: Data;
  date: string;
  planning: PlanningResult;
  onLog: (plan?: Plan) => void;
  onCheckIn: () => void;
  onPlan: () => void;
  onCalendar: () => void;
  onInsights: () => void;
  onApply: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void;
  onOverride: () => void;
}) {
  const next = data.tournaments
    .filter((t) => t.endDate >= date)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const w7 = workload(data.sessions, date, 7),
    w28 = workload(data.sessions, date, 28),
    week = workload(
      data.sessions,
      date,
      daysBetween(weekStart(date), date) + 1,
    );
  const check = data.checkIns.find((c) => c.date === date),
    b = baseline(data.checkIns, date);
  const schedule = data.plans
    .filter((p) => p.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
  const completed = data.sessions.filter(
    (s) => s.date === date && !s.plannedSessionId,
  );
  return (
    <>
      <div className="dashboard-top">
        <section className="phase-panel">
          <div className="phase-top">
            <span className="status-dot" />
            Current training emphasis
            <button className="text-button" onClick={onOverride}>
              Override <ArrowUpRight size={14} />
            </button>
          </div>
          <h2>
            {planning.phase === "Taper"
              ? "Sharpen. Then show up."
              : planning.phase === "Build"
                ? "Make room for progress."
                : planning.phase === "Recover"
                  ? "Let recovery lead today."
                  : planning.phase === "Maintain"
                    ? "Find your training rhythm."
                    : "Your next chapter starts here."}
          </h2>
          <p>{planning.reason}</p>
          <div className="phase-bottom">
            <Badge className="phase-badge">
              {planning.phase}
              {planning.provisional ? " · Provisional" : ""}
            </Badge>
            <span>Rolling plan, tailored to your calendar</span>
          </div>
        </section>
        <section className="competition-panel">
          <div className="row spread">
            <span className="muted">Next competition</span>
            <Trophy size={20} />
          </div>
          {next ? (
            <>
              <div className="competition-count">
                <strong>
                  {Math.max(0, daysBetween(date, next.startDate))}
                </strong>
                <span>
                  {next.startDate <= date ? "event underway" : "days to go"}
                </span>
                <Badge className={`priority-${next.priority}`}>
                  {next.priority} priority
                </Badge>
              </div>
              <h2>{next.name}</h2>
              <p>
                {fmt(next.startDate, { day: "numeric", month: "long" })}
                {next.endDate !== next.startDate
                  ? " – " + fmt(next.endDate)
                  : ""}
              </p>
              {next.location && (
                <span className="location">
                  <MapPin size={13} />
                  {next.location}
                </span>
              )}
              <button className="text-button" onClick={onCalendar}>
                View competition calendar <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <>
              <h2>Your calendar is open.</h2>
              <p>Add a tournament to shape your preparation.</p>
              <button className="text-button" onClick={onCalendar}>
                Add a competition <Plus size={15} />
              </button>
            </>
          )}
        </section>
      </div>
      <div className="metrics-strip">
        <div>
          <span>Last 7 days</span>
          <strong>
            {workloadLabel(w7)} <small>AU</small>
          </strong>
          <p>
            {w7.count} sessions recorded
            {w7.missing ? ` · ${w7.missing} unknown load` : ""}
          </p>
        </div>
        <div>
          <span>Last 28 days</span>
          <strong>
            {workloadLabel(w28)} <small>AU</small>
          </strong>
          <p>
            Rolling completed workload{w28.missing ? " · partial total" : ""}
          </p>
        </div>
        <div>
          <span>This week</span>
          <strong>
            {week.count} <small>/ {data.profile?.frequency} sessions</small>
          </strong>
          <p>Monday through today</p>
        </div>
        <div>
          <span>Recovery check-in</span>
          <strong className="status-value">
            {check ? (
              <>
                <CheckCircle2 size={21} />
                Recorded
              </>
            ) : (
              "How are you?"
            )}
          </strong>
          <button className="text-button" onClick={onCheckIn}>
            {check ? "Review today’s check-in" : "Take a moment to check in"}{" "}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
      <div className="dashboard-middle">
        <section className="panel workload-panel">
          <SectionTitle
            title="Your workload, in perspective"
            detail="Daily session load · last 6 weeks"
            action={
              <button
                className="icon-button"
                aria-label="Open workload insights"
                onClick={onInsights}
              >
                <ArrowUpRight size={20} />
              </button>
            }
          />
          <div className="chart-legend">
            <span className="legend-dot" />
            Completed load <span className="muted">AU · minutes × RPE</span>
          </div>
          {data.sessions.length ? (
            <LoadChart data={data} date={date} />
          ) : (
            <Empty
              title="A clearer picture starts with a session"
              description="Your recorded workload will appear here as you train."
              action={
                <button className="button" onClick={() => onLog()}>
                  Log your first session
                </button>
              }
            />
          )}
        </section>
        <section className="panel schedule-panel">
          <SectionTitle
            title="On your schedule"
            detail={fmt(date, {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
            action={
              <button
                className="icon-button"
                onClick={onPlan}
                aria-label="Plan a session"
              >
                <Plus size={20} />
              </button>
            }
          />
          {!schedule.length && !completed.length ? (
            <Empty
              title="A little breathing room"
              description="No sessions planned for today."
              action={
                <button className="text-button" onClick={onPlan}>
                  Plan a session
                </button>
              }
            />
          ) : (
            <div className="schedule-list">
              {schedule.map((p) => (
                <div className="schedule-item" key={p.id}>
                  <div className={`activity-icon ${categoryClass(p.category)}`}>
                    <CategoryIcon category={p.category} />
                  </div>
                  <div>
                    <span className="schedule-time">
                      {p.status === "rest" ? "All day" : p.time}
                      {p.status === "completed" ? " · Completed" : ""}
                    </span>
                    <h3>{p.title}</h3>
                    <p>
                      {p.status === "rest"
                        ? "Space to recharge"
                        : `${durationLabel(p.duration)} · ${p.customActivity ?? p.category}`}
                    </p>
                  </div>
                  {p.status === "planned" ? (
                    <button
                      className="icon-button"
                      aria-label={`Complete ${p.title}`}
                      onClick={() => onLog(p)}
                    >
                      <ArrowRight size={18} />
                    </button>
                  ) : p.status === "completed" ? (
                    <Check size={17} />
                  ) : null}
                </div>
              ))}
              {completed.map((s) => (
                <div className="schedule-item" key={s.id}>
                  <div className={`activity-icon ${categoryClass(s.category)}`}>
                    <CategoryIcon category={s.category} />
                  </div>
                  <div>
                    <span className="schedule-time">Completed</span>
                    <h3>{s.title}</h3>
                    <p>
                      {s.durationMinutes} min · {s.sessionLoad ?? "Unknown"} AU
                    </p>
                  </div>
                  <Check size={17} />
                </div>
              ))}
            </div>
          )}
          <button className="text-button schedule-footer" onClick={onCalendar}>
            View your full calendar <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section className="recommendations">
        <SectionTitle
          title="A little direction for your next step"
          detail="Explainable suggestions. You’re always in control."
        />
        <div className="recommendation-grid">
          {planning.suggestions.length ? (
            planning.suggestions.map((s) => (
              <article className="recommendation" key={s.key}>
                <div className="recommendation-label">
                  <Sparkles size={16} />
                  <span>{s.classification}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {s.planId && (
                  <div className="affected">
                    <Clock3 size={14} />
                    {data.plans.find((p) => p.id === s.planId)?.title} ·{" "}
                    {fmt(data.plans.find((p) => p.id === s.planId)!.date)}
                  </div>
                )}
                <details>
                  <summary>Why this suggestion?</summary>
                  <p>{s.why}</p>
                  <p>
                    <strong>What’s uncertain:</strong> {s.uncertainty}
                  </p>
                  <p className="helper">
                    Inputs:{" "}
                    {s.inputIds.length
                      ? s.inputIds
                          .map(
                            (id) =>
                              data.tournaments.find((t) => t.id === id)?.name ??
                              data.plans.find((p) => p.id === id)?.title ??
                              data.checkIns.find((c) => c.id === id)?.date ??
                              data.sessions.find((c) => c.id === id)?.title ??
                              id,
                          )
                          .join(", ")
                      : "Current calendar and profile"}
                    . Algorithm {PLANNER_VERSION}.
                  </p>
                </details>
                <div className="recommendation-actions">
                  {s.planId && (
                    <button
                      className="button small primary"
                      onClick={() => onApply(s)}
                    >
                      {s.actionLabel}
                    </button>
                  )}
                  <button className="text-button" onClick={() => onDismiss(s)}>
                    Dismiss
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="quiet-message">
              <CheckCircle2 size={20} />
              You’ve reviewed your suggestions. Your plan stays in your hands.
            </div>
          )}
        </div>
      </section>
      <section className="panel horizon-panel">
        <SectionTitle
          title="The next 6 weeks"
          detail="Preparation windows follow your A / B / C preferences."
          action={
            <button className="text-button" onClick={onCalendar}>
              Open calendar <ArrowRight size={14} />
            </button>
          }
        />
        <div className="horizon-labels">
          <span>{fmt(date)}</span>
          <span>{fmt(addDays(date, 13))}</span>
          <span>{fmt(addDays(date, 27))}</span>
          <span>{fmt(addDays(date, 41))}</span>
        </div>
        <div className="horizon">
          {planning.horizon.map((d, i) => (
            <div
              key={d.date}
              className={`horizon-day ${d.phase.toLowerCase().replaceAll(" ", "-")} ${i < 14 ? "near" : ""}`}
              title={`${fmt(d.date)}: ${d.phase}${
                d.eventIds.length
                  ? " · " +
                    data.tournaments
                      .filter((t) => d.eventIds.includes(t.id))
                      .map((t) => t.name)
                      .join(", ")
                  : ""
              }`}
            >
              {data.tournaments
                .filter((t) => t.startDate === d.date)
                .map((t) => (
                  <span key={t.id}>{t.priority}</span>
                ))}
            </div>
          ))}
        </div>
        <div className="horizon-key">
          <span>
            <i className="horizon-swatch build" />
            Development space
          </span>
          <span>
            <i className="horizon-swatch taper" />
            Preparation window
          </span>
          <span>First 14 days shown with greater detail in Calendar</span>
        </div>
      </section>
      <div className="dashboard-footnote">
        {b.valid
          ? `Recovery comparisons use your ${b.count} valid check-ins in the prior 14 days.`
          : `Recovery baseline: ${b.count}/7 entries. No personal baseline is assumed.`}{" "}
        Planning descriptors are suggestions, not readiness diagnoses.
      </div>
    </>
  );
}
