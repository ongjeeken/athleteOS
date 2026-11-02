import { durationLabel } from "../domain/routine";
import type { Data } from "../domain/models";
import type { PlanningResult } from "../domain/planner";
import { dateRange, fmt } from "../domain/dates";
import { historyQuality } from "../domain/history";
import { typicalWeek } from "../domain/setup";
import { Badge, SectionTitle } from "./ui";
export function StartingPlan({
  data,
  date,
  planning,
  onDate,
  onWeek,
  onHistory,
}: {
  data: Data;
  date: string;
  planning: PlanningResult;
  onDate: (d: string) => void;
  onWeek: () => void;
  onHistory: () => void;
}) {
  const next = data.tournaments
    .filter((t) => t.endDate >= date)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const profile = data.profile!,
    week = typicalWeek(profile),
    quality = historyQuality(data, date);
  if (!profile.weeklyRules && !data.history.length) return null;
  return (
    <section className="panel starting-plan">
      <SectionTitle
        title="Your next 14 days"
        detail={
          planning.provisional
            ? "Provisional: your routine and competitions guide the plan. Actual workload and recovery are still incomplete."
            : "Your planned routine alongside recorded training."
        }
        action={
          planning.provisional ? (
            <Badge>Provisional · {planning.phase}</Badge>
          ) : undefined
        }
      />
      <p className="starting-competition">
        {next ? (
          <>
            Next competition: <strong>{next.name}</strong> · {next.priority}{" "}
            priority · {fmt(next.startDate)}
          </>
        ) : (
          "No upcoming competitions. Your provisional plan focuses on general training development."
        )}
      </p>
      <div className="starting-pattern">
        <div>
          <span>Training objective</span>
          <strong>{profile.primaryGoal ?? profile.goals}</strong>
        </div>
        <div>
          <span>Typical planned week</span>
          <strong>
            {week.unknownDuration > 0
              ? `${week.count} sessions · ${week.unknownDuration} durations not set${week.minutes ? ` · ${week.minutes} known planned minutes` : ""}`
              : `${(week.minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} hours · ${week.count} sessions`}
          </strong>
        </div>
        <div>
          <span>Activity distribution</span>
          <strong>
            {Object.entries(week.distribution)
              .map(([c, n]) => `${c} ${n}`)
              .join(" · ") || "No recurring sessions yet"}
          </strong>
        </div>
      </div>
      <div className="fortnight-calendar">
        {dateRange(date, 14).map((d) => {
          const plans = data.plans.filter((p) => p.date === d);
          const tournaments = data.tournaments.filter(
            (t) => t.startDate <= d && t.endDate >= d,
          );
          return (
            <button
              key={d}
              aria-label={`Open plan ${d}`}
              onClick={() => onDate(d)}
            >
              <span>{fmt(d, { weekday: "short" })}</span>
              <strong>{fmt(d, { day: "numeric", month: "short" })}</strong>
              {tournaments.map((t) => (
                <small className="fortnight-competition" key={t.id}>
                  {t.priority} · {t.name}
                </small>
              ))}
              {plans.slice(0, 2).map((p) => (
                <small key={p.id}>
                  {p.title}
                  {p.status === "rest" ? "" : ` · ${durationLabel(p.duration)}`}
                </small>
              ))}
              {plans.length > 2 && <small>+{plans.length - 2} more</small>}
              {!plans.length && !tournaments.length && (
                <small>No sessions planned</small>
              )}
            </button>
          );
        })}
      </div>
      <div className="starting-quality">
        <div>
          <h3>What’s known so far</h3>
          <p>
            Last 28 days: {quality.confirmed} confirmed sessions ·{" "}
            {quality.actualMinutes} directly reported minutes
            {quality.estimatedMinutes
              ? ` + approximately ${quality.estimatedMinutes} estimated minutes`
              : ""}
            .
          </p>
          <p>
            {quality.missingRpe
              ? `${quality.missingRpe} sessions have unknown RPE. `
              : ""}
            {quality.unconfirmed
              ? `${quality.unconfirmed} historical entries are still unconfirmed. `
              : ""}
            Unconfirmed records never enter actual workload. Estimated-duration
            load is kept out of precise workload recommendations.
          </p>
        </div>
        <div className="starting-actions">
          <button className="text-button" onClick={onWeek}>
            Edit typical week
          </button>
          <button className="text-button" onClick={onHistory}>
            {quality.unconfirmed
              ? "Review uncertain history"
              : "Add or import history"}
          </button>
        </div>
      </div>
    </section>
  );
}
