import { intensities } from "./model";
import type { Session } from "./model";
import { intensityFocus } from "./intensity";

export function SessionIntensity({
  session,
  date,
  compact,
  onUpdate,
}: {
  session: Session;
  date: string;
  compact: boolean;
  onUpdate: (session: Session) => boolean;
}) {
  const recommendation = session.recommendation;
  if (!recommendation)
    return session.status === "skipped" ? null : (
      <p className="intensity-missing">
        No suggestion recorded for this session.
      </p>
    );
  const level = session.intensityOverride ?? recommendation.level;
  const description = session.intensityOverride
    ? intensityFocus(session.kind, level)
    : recommendation.focus;
  const canAdjust = session.status === "planned" && session.date >= date;
  return (
    <div
      className={`intensity-guidance ${compact ? "compact" : ""}`}
      aria-label="Training intensity guidance"
    >
      <div className="intensity-line">
        <span>{session.intensityOverride ? "Your plan:" : "Recommended:"}</span>
        <strong className={`intensity-badge intensity-${level.toLowerCase()}`}>
          {level}
        </strong>
        {session.intensityOverride && (
          <span className="original-intensity">
            Suggested: {recommendation.level}
          </span>
        )}
      </div>
      {!compact && <p className="intensity-focus">{description}</p>}
      <details className="intensity-details">
        <summary>
          {compact
            ? canAdjust
              ? "Why / adjust"
              : "Why"
            : canAdjust
              ? "Why / adjust intensity"
              : "Why this intensity"}
        </summary>
        <p>{recommendation.reason}</p>
        {compact && <p>{description}</p>}
        {session.intensityOverride && (
          <p>
            Your choice changes the plan, while keeping the original suggestion
            on record.
          </p>
        )}
        {canAdjust && (
          <fieldset>
            <legend>Your planned intensity</legend>
            <div className="intensity-options">
              {intensities.map((value) => (
                <button
                  type="button"
                  className={`intensity-${value.toLowerCase()}`}
                  aria-label={`Plan ${value}`}
                  aria-pressed={session.intensityOverride === value}
                  key={value}
                  onClick={() =>
                    onUpdate({
                      ...session,
                      intensityOverride: value,
                      modified: true,
                    })
                  }
                >
                  {value}
                </button>
              ))}
            </div>
            {session.intensityOverride && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onUpdate({
                    ...session,
                    intensityOverride: undefined,
                    modified: true,
                  })
                }
              >
                Use suggested intensity
              </button>
            )}
          </fieldset>
        )}
      </details>
    </div>
  );
}
