import type { DailyDemand } from "./daily-demand";

export function DailyDemandBadge({
  demand,
  explain = false,
  day,
}: {
  demand: DailyDemand;
  explain?: boolean;
  day?: string;
}) {
  const badge = (
    <span
      className={`daily-demand-badge intensity-${demand.level.toLowerCase()}`}
    >
      {demand.level}
    </span>
  );
  if (!explain) return badge;
  return (
    <details className="daily-demand-explanation">
      <summary aria-label={`Why ${day ?? "today"} is ${demand.level}`}>
        {badge}
        <span className="demand-why">Why?</span>
      </summary>
      <p>
        {demand.reason} This is a provisional relative plan, not a physiological
        workload measurement.
      </p>
    </details>
  );
}

export function TodayDemand({ demand }: { demand: DailyDemand }) {
  return (
    <section className="today-demand" aria-label="Today's daily demand">
      <div className="today-demand-heading">
        <div>
          <h2>Today’s demand</h2>
          <p className="daily-demand-context">Provisional daily plan</p>
        </div>
        <DailyDemandBadge demand={demand} />
      </div>
      <p>{demand.reason.split(" Where a saved suggestion")[0]}</p>
      <details>
        <summary>How daily demand works</summary>
        <p>
          We combine planned session types and intensities qualitatively. Two
          Moderate training sessions can make a Hard day; gentle recovery is
          treated separately. This is a provisional relative plan, not a
          physiological workload measurement.
        </p>
        {demand.reason.includes("Where a saved suggestion") && (
          <p>
            Some older sessions have no saved suggestion. They use a Moderate
            training or Light recovery starting point for this daily view; their
            original records stay unchanged.
          </p>
        )}
      </details>
    </section>
  );
}
