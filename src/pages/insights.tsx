import { useState } from "react";
import {
  categories,
  type CheckIn,
  type Data,
  type Pain,
} from "../domain/models";
import { addDays, daysBetween, fmt } from "../domain/dates";
import { baseline, workload, workloadLabel } from "../domain/analytics";
import { categoryColors, LoadChart, RecoveryChart } from "../components/charts";
import { Empty, SectionTitle } from "../components/ui";
import { Edit2, Trash2 } from "lucide-react";
export function InsightsPage({
  data,
  date,
  onHistoryPlan,
  onCheckIn,
  onDeleteCheckIn,
  onDeletePain,
}: {
  data: Data;
  date: string;
  onHistoryPlan: () => void;
  onCheckIn: (c: CheckIn) => void;
  onDeleteCheckIn: (c: CheckIn) => void;
  onDeletePain: (p: Pain) => void;
}) {
  const [category, setCategory] = useState("All activities"),
    [from, setFrom] = useState(addDays(date, -41)),
    [to, setTo] = useState(date),
    [weekly, setWeekly] = useState(false);
  const valid = from <= to && daysBetween(from, to) < 367;
  const filtered = {
    ...data,
    sessions: data.sessions.filter(
      (s) =>
        (category === "All activities" || s.category === category) &&
        s.date >= from &&
        s.date <= to,
    ),
    plans: data.plans.filter(
      (s) =>
        (category === "All activities" || s.category === category) &&
        s.date >= from &&
        s.date <= to,
    ),
  };
  const total = workload(
      filtered.sessions,
      to,
      Math.max(1, daysBetween(from, to) + 1),
    ),
    b = baseline(data.checkIns, date),
    planned = filtered.plans.filter((p) => p.status !== "rest"),
    done = planned.filter((p) => p.status === "completed");
  return (
    <>
      <div className="schedule-entry-actions">
        <button className="button" onClick={onHistoryPlan}>
          Use My Training History to Plan Ahead
        </button>
        <span className="helper">
          Review a routine from completed training before adding future
          sessions.
        </span>
      </div>
      <div className="filters insights-filters">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            max={date}
            required
          />
        </label>
        <label>
          Activity
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>All activities</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {!valid ? (
        <div className="form-error" role="alert">
          Choose a valid range of at most 366 days.
        </div>
      ) : (
        <>
          <section className="panel duration-insights">
            <SectionTitle
              title="Training time and attendance"
              detail="Confirmed sessions count even when effort is unknown. Planned and unverified entries remain separate."
            />
            <div className="starting-pattern">
              <div>
                <span>Confirmed training</span>
                <strong>
                  {total.count} sessions · {total.minutes} minutes reported
                </strong>
              </div>
              <div>
                <span>Estimated durations</span>
                <strong>
                  {total.estimatedCount} sessions · approximately{" "}
                  {filtered.sessions
                    .filter((s) =>
                      s.provenance?.estimatedFields.includes("durationMinutes"),
                    )
                    .reduce((n, s) => n + s.durationMinutes, 0)}{" "}
                  minutes
                </strong>
              </div>
              <div>
                <span>Unverified history</span>
                <strong>
                  {
                    data.history.filter(
                      (h) =>
                        h.status === "unconfirmed" &&
                        h.date >= from &&
                        h.date <= to &&
                        (category === "All activities" ||
                          h.category === category),
                    ).length
                  }{" "}
                  entries excluded from actual analytics
                </strong>
              </div>
            </div>
            <p className="helper">
              Recorded load below uses completed sessions with valid RPE and
              directly reported duration. Estimated-duration load stays separate
              from precise totals.
            </p>
          </section>
          <div className="metrics-strip">
            <div>
              <span>Recorded load</span>
              <strong>
                {workloadLabel(total)} <small>AU</small>
              </strong>
              <p>
                {total.missing
                  ? `${total.missing} sessions without reliable load · partial total`
                  : "Selected date range"}
              </p>
            </div>
            <div>
              <span>Training frequency</span>
              <strong>
                {total.count} <small>sessions</small>
              </strong>
              <p>Across {total.days} calendar days</p>
            </div>
            <div>
              <span>Plan completion</span>
              <strong>
                {done.length} <small>/ {planned.length}</small>
              </strong>
              <p>Linked completed sessions only</p>
            </div>
            <div>
              <span>Rolling workload to {fmt(to)}</span>
              <strong className="compact-metric">
                {workload(filtered.sessions, to, 7).load}{" "}
                <small>/ {workload(filtered.sessions, to, 28).load} AU</small>
              </strong>
              <p>7 / 28 days within selected filter</p>
            </div>
          </div>
          <div className="insights-grid">
            <section className="panel">
              <SectionTitle
                title="Training load"
                detail="Completed workload, with competition markers"
                action={
                  <div className="segmented">
                    <button
                      className={!weekly ? "active" : ""}
                      onClick={() => setWeekly(false)}
                    >
                      Daily
                    </button>
                    <button
                      className={weekly ? "active" : ""}
                      onClick={() => setWeekly(true)}
                    >
                      Weekly
                    </button>
                  </div>
                }
              />
              {filtered.sessions.length ? (
                <LoadChart
                  data={filtered}
                  date={to}
                  days={Math.max(1, daysBetween(from, to) + 1)}
                  weekly={weekly}
                  showPlanned
                />
              ) : (
                <Empty
                  title="No sessions in this range"
                  description="Adjust your filters or record a completed session."
                />
              )}
              <p className="helper">
                Planned load is a separate estimate. A missing target RPE is
                excluded. Weekly view shows the six Monday-based weeks ending in
                the selected end week.
              </p>
            </section>
            <section className="panel">
              <SectionTitle
                title="Where your work goes"
                detail="Session-RPE load by activity"
              />
              <div className="distribution">
                {categories.map((c) => {
                  const w = workload(
                    filtered.sessions.filter((s) => s.category === c),
                    to,
                    Math.max(1, daysBetween(from, to) + 1),
                  );
                  return (
                    <div key={c}>
                      <div className="row spread">
                        <span>
                          <i style={{ background: categoryColors[c] }} />
                          {c}
                        </span>
                        <strong>
                          {workloadLabel(w)} <small>AU</small>
                        </strong>
                      </div>
                      <div className="distribution-track">
                        <div
                          style={{
                            width: total.load
                              ? `${(w.load / total.load) * 100}%`
                              : "0",
                            background: categoryColors[c],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="helper">
                AU tracks perceived internal load. Equal AU across activities
                does not imply equal physical or cognitive demands.
              </p>
            </section>
          </div>
          <section className="panel">
            <SectionTitle
              title="Recovery alongside your training"
              detail="Last 14 days · missing check-ins leave gaps"
            />
            <RecoveryChart data={data} date={to} />
            <p className="helper">
              Energy: 1 = very low, 5 = excellent. Fatigue and soreness: 1 =
              none, 5 = extreme.{" "}
              {b.valid
                ? `Today’s personal baseline uses ${b.count} prior entries: fatigue ${b.values.fatigue}, soreness ${b.values.soreness}, energy ${b.values.energy}.`
                : `${b.count}/7 prior entries; insufficient data for a personal baseline.`}{" "}
              Compare the dated workload and recovery charts as observations;
              they do not establish cause.
            </p>
          </section>
        </>
      )}
      <section className="panel">
        <SectionTitle
          title="Recovery journal"
          detail="Review or correct your daily observations"
        />
        {data.checkIns.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sleep quality</th>
                  <th>Energy</th>
                  <th>Fatigue</th>
                  <th>Soreness</th>
                  <th>Stress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...data.checkIns]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 30)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>{fmt(c.date)}</td>
                      <td>{c.sleep}/5</td>
                      <td>{c.energy}/5</td>
                      <td>{c.fatigue}/5</td>
                      <td>{c.soreness}/5</td>
                      <td>{c.stress}/5</td>
                      <td>
                        <div className="row">
                          <button
                            className="icon-button"
                            aria-label={`Edit check-in ${c.date}`}
                            onClick={() => onCheckIn(c)}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete check-in ${c.date}`}
                            onClick={() => onDeleteCheckIn(c)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Check in from Today to start seeing your personal patterns.
          </p>
        )}
      </section>
      {data.pain.length > 0 && (
        <section className="panel">
          <SectionTitle title="Symptom observations" />
          {[...data.pain]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((p) => (
              <div className="detail-event" key={p.id}>
                <div className="flex-one">
                  <h3>
                    {p.location} · {p.severity}/10
                  </h3>
                  <p>
                    {fmt(p.date)} · {p.trend}
                  </p>
                  <p>
                    During: {p.during || "Unknown"}. Next day:{" "}
                    {p.nextDay || "Unknown"}.
                  </p>
                  {p.notes && <p>{p.notes}</p>}
                </div>
                <button
                  className="icon-button"
                  aria-label={`Delete symptom ${p.location}`}
                  onClick={() => onDeletePain(p)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          <p className="helper">
            Seek an appropriate professional assessment for concerning or
            worsening symptoms.
          </p>
        </section>
      )}
    </>
  );
}
