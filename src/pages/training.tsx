import { useState } from "react";
import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import { categories, type Data, type Session } from "../domain/models";
import { fmt } from "../domain/dates";
import {
  Badge,
  CategoryIcon,
  categoryClass,
  Empty,
  SectionTitle,
} from "../components/ui";
export function TrainingPage({
  data,
  onLog,
  onEdit,
  onDelete,
}: {
  data: Data;
  onLog: () => void;
  onEdit: (s: Session) => void;
  onDelete: (s: Session) => void;
}) {
  const [filter, setFilter] = useState("All activities"),
    [query, setQuery] = useState("");
  const rows = data.sessions
    .filter(
      (s) =>
        (filter === "All activities" || s.category === filter) &&
        (s.title + " " + s.notes).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  return (
    <>
      <section className="training-intro">
        <div>
          <h2>Small entries. A bigger picture.</h2>
          <p>Capture the work, how it felt, and anything worth remembering.</p>
        </div>
        <button className="button primary" onClick={onLog}>
          <Plus size={17} />
          Log session
        </button>
      </section>
      <section className="panel">
        <SectionTitle
          title="Training journal"
          detail={`${rows.length} completed sessions`}
        />
        <div className="filters">
          <label className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search sessions"
              placeholder="Find a session…"
            />
          </label>
          <select
            aria-label="Filter training activity"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All activities</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {rows.length ? (
          <div className="training-list">
            {rows.map((s) => {
              const es = data.exercises.filter((e) => e.sessionId === s.id);
              return (
                <article className="journal-row" key={s.id}>
                  <div className={`activity-icon ${categoryClass(s.category)}`}>
                    <CategoryIcon category={s.category} />
                  </div>
                  <div className="journal-main">
                    <span className="journal-date">
                      {fmt(s.date, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {s.time}
                    </span>
                    <h3>{s.title}</h3>
                    <div className="journal-meta">
                      <Badge className={categoryClass(s.category)}>
                        {s.category}
                      </Badge>
                      <span>{s.durationMinutes} min</span>
                      <span>
                        {s.rpe === null ? "RPE not recorded" : `RPE ${s.rpe}`}
                      </span>
                      <span>
                        {s.sessionLoad === null
                          ? "Load unknown"
                          : `${s.sessionLoad} AU`}
                      </span>
                    </div>
                    {s.provenance && (
                      <p className="provenance-note">
                        {s.provenance.source === "weekly"
                          ? "Reconstructed"
                          : s.provenance.source === "csv" ||
                              s.provenance.source === "ics"
                            ? "Imported"
                            : "Directly reported"}{" "}
                        · Athlete-confirmed
                        {s.provenance.estimatedFields.includes(
                          "durationMinutes",
                        )
                          ? " · Estimated duration (load excluded from precise totals)"
                          : " · Reported duration"}{" "}
                        · {s.provenance.sourceName}
                      </p>
                    )}
                    {(s.notes ||
                      es.length > 0 ||
                      s.bouts !== undefined ||
                      s.modality) && (
                      <details>
                        <summary>Session details</summary>
                        {s.notes && <p>{s.notes}</p>}
                        {s.bouts !== undefined && (
                          <p>
                            {s.bouts} bouts
                            {s.activeMinutes !== undefined
                              ? ` · ${s.activeMinutes} active fencing minutes`
                              : ""}
                            {s.cognitiveDemand !== undefined
                              ? ` · cognitive demand ${s.cognitiveDemand}/10`
                              : ""}
                            {s.legFatigue !== undefined
                              ? ` · leg fatigue ${s.legFatigue}/10`
                              : ""}
                          </p>
                        )}
                        {s.modality && (
                          <p>
                            {s.modality}
                            {s.distance !== undefined
                              ? ` · ${s.distance} km`
                              : ""}
                          </p>
                        )}
                        {s.results && <p>Result: {s.results}</p>}
                        {es.map((e) => (
                          <div key={e.id}>
                            <strong>{e.name}</strong>
                            <p>
                              {data.sets
                                .filter((set) => set.exerciseId === e.id)
                                .sort((a, b) => a.order - b.order)
                                .map(
                                  (set) =>
                                    `${set.reps} reps × ${set.weight} kg${set.setRpe !== undefined ? ` @ RPE ${set.setRpe}` : ""}${set.rir !== undefined ? ` (${set.rir} RIR)` : ""}`,
                                )
                                .join(" / ")}
                            </p>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                  <div className="row">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${s.title}`}
                      onClick={() => onEdit(s)}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${s.title}`}
                      onClick={() => onDelete(s)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title={
              data.sessions.length
                ? "No matching sessions"
                : "Your training story starts here"
            }
            description={
              data.sessions.length
                ? "Try a different activity or search."
                : "Log your first session. Choose an effort level, or leave it unknown."
            }
            action={
              <button className="button" onClick={onLog}>
                Log session
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
