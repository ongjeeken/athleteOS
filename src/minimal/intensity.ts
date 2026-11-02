import { addDays, daysBetween, fmt, weekStart } from "../domain/dates";
import type {
  Competition,
  Intensity,
  Kind,
  Recommendation,
  Session,
  TrackerData,
} from "./model";
import { materialize } from "./schedule";

export const INTENSITY_VERSION = 1;
const focus: Record<Kind, Record<Intensity, string>> = {
  fencing: {
    Light: "Technical drills, quality footwork and fewer demanding bouts.",
    Moderate: "Normal structured practice, with controlled intensity.",
    Hard: "More demanding bouts or higher-intensity fencing work.",
  },
  strength: {
    Light: "Reduce volume; use manageable loads or focus on technique.",
    Moderate: "Normal strength work, keeping volume and loads manageable.",
    Hard: "More challenging strength work; choose volume and loads with your coach.",
  },
  conditioning: {
    Light: "Easy aerobic or recovery-oriented exercise.",
    Moderate: "Sustainable conditioning at a controlled effort.",
    Hard: "Challenging intervals or higher-intensity conditioning.",
  },
  recovery: {
    Light: "Keep the focus on gentle mobility or recovery-oriented work.",
    Moderate: "Choose a manageable demand for the activity you have in mind.",
    Hard: "Choose what challenging means for this activity; keep its intended purpose in mind.",
  },
  other: {
    Light: "Reduce the demand in a way that makes sense for this activity.",
    Moderate: "Aim for a normal, manageable demand for this activity.",
    Hard: "Choose a challenging demand appropriate to this activity.",
  },
};
export const intensityFocus = (kind: Kind, level: Intensity) =>
  focus[kind][level];
const active = (session: Session) =>
  !session.removed && session.status !== "skipped";
const training = (session: Session) =>
  active(session) && session.kind !== "recovery";
export function knownCompetitions(data: TrackerData): Competition[] {
  return [
    ...(data.competitionHistory ?? []),
    ...(data.competition ? [data.competition] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/** Preserve passed events as context; editing a future event replaces it. */
export function changeCompetition(
  data: TrackerData,
  competition: Competition | undefined,
  asOf: string,
): TrackerData {
  let history = data.competitionHistory ?? [];
  if (
    competition &&
    data.competition &&
    data.competition.date < asOf &&
    data.competition.date !== competition?.date
  ) {
    history = [
      ...history.filter((c) => c.date !== data.competition!.date),
      data.competition,
    ];
  }
  return {
    ...data,
    competition,
    ...(history.length ? { competitionHistory: history } : {}),
  };
}

function consecutiveDays(dates: Set<string>, date: string) {
  let count = 0;
  for (let d = date; dates.has(d); d = addDays(d, -1)) count++;
  return count;
}

/** Conservative product heuristics, not a physiological model. The schedule is
 * considered together; no duration, RPE math, readiness or fatigue estimate. */
export function recommendIntensities(
  data: TrackerData,
  asOf: string,
): Map<string, Recommendation> {
  const result = new Map<string, Recommendation>();
  const competitions = knownCompetitions(data);
  const sessions = data.sessions
    .filter(active)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const trainingSessions = sessions.filter(training);
  const trainingDates = new Set(trainingSessions.map((s) => s.date));
  const hardDates = new Set(
    trainingSessions
      .filter(
        (s) =>
          (s.status === "completed" && s.effort === "Hard") ||
          (s.status === "planned" &&
            s.date >= asOf &&
            s.intensityOverride === "Hard") ||
          (s.date < asOf &&
            s.status === "planned" &&
            (s.intensityOverride ?? s.recommendation?.level) === "Hard"),
      )
      .map((s) => s.date),
  );
  const hardSessions = (start: string) =>
    trainingSessions.filter(
      (s) =>
        s.date >= start &&
        s.date <= addDays(start, 6) &&
        ((s.status === "completed" &&
          (s.effort === "Hard" ||
            s.recommendation?.level === "Hard" ||
            s.intensityOverride === "Hard")) ||
          (s.status === "planned" &&
            (s.intensityOverride === "Hard" ||
              (s.date < asOf &&
                !s.intensityOverride &&
                s.recommendation?.level === "Hard")))),
    ).length;
  const allocated = new Map<string, number>();
  const actuals = trainingSessions
    .filter(
      (s) =>
        s.status === "completed" &&
        s.date >= addDays(asOf, -7) &&
        s.date <= asOf,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, 5);
  const recentHard = actuals.filter((s) => s.effort === "Hard");
  const latestHard = recentHard[0]?.date;

  for (const session of sessions) {
    // Historical recommendations are immutable; older records are not backfilled.
    if (session.status !== "planned" || session.date < asOf) {
      if (session.recommendation)
        result.set(session.id, session.recommendation);
      continue;
    }
    let level: Intensity = "Moderate";
    let rule = "baseline";
    let reason =
      "A normal, manageable session is a starting point; no training history is required.";
    const next = competitions.find((c) => c.date >= session.date);
    const gap = next ? daysBetween(session.date, next.date) : Infinity;
    const priority = next?.priority === "priority";
    const eventLabel = next
      ? `${priority ? "Priority competition" : "Regular competition"} on ${fmt(next.date, { weekday: "long", day: "numeric", month: "short" })}`
      : "";
    const previous = competitions.filter((c) => c.date < session.date).at(-1);
    const sameDay = trainingSessions.filter(
      (s) => s.date === session.date,
    ).length;
    const consecutive = consecutiveDays(trainingDates, session.date);
    const week = weekStart(session.date);
    const weekSessions = trainingSessions.filter(
      (s) => s.date >= week && s.date <= addDays(week, 6),
    );
    const dense =
      weekSessions.length >= 8 ||
      new Set(weekSessions.map((s) => s.date)).size >= 6;
    const limit = dense ? 1 : 2;
    const plannedHardCount = allocated.get(week) ?? 0;
    const nearbyHard =
      [addDays(session.date, -1), addDays(session.date, 1)].some((d) =>
        hardDates.has(d),
      ) ||
      trainingSessions.some(
        (s) =>
          s.id !== session.id &&
          s.date === session.date &&
          ((s.status === "completed" && s.effort === "Hard") ||
            (s.status === "planned" && s.intensityOverride === "Hard")),
      );
    const feedback =
      recentHard.length >= 3 &&
      latestHard &&
      daysBetween(latestHard, session.date) <= 2;
    if (session.kind === "recovery") {
      level = "Light";
      rule = "recovery";
      reason =
        "This session is recovery / mobility, so a gentle demand is the starting point.";
    } else if (gap === 0) {
      level = "Light";
      rule = "competition-day";
      reason = `${eventLabel}. Keep any additional training light; the event itself is separate.`;
    } else if (gap === 1 || (priority && gap === 2)) {
      level = "Light";
      rule = "competition-close";
      reason = `${eventLabel}, ${gap === 1 ? "tomorrow" : "in two days"}. Reduce the demand while keeping your planned session.`;
    } else if ((priority && gap <= 4) || (!priority && gap === 2)) {
      level =
        priority &&
        (session.kind === "strength" || session.kind === "conditioning")
          ? "Light"
          : "Moderate";
      rule = "competition-approach";
      reason = `${eventLabel}, in ${gap} days. ${level === "Light" ? "Reduce demanding strength or conditioning work as it approaches." : "Keep useful practice, with controlled demand rather than a hard session."}`;
    } else if (previous?.date === addDays(session.date, -1)) {
      level = "Light";
      rule = "after-competition";
      reason =
        "A competition was scheduled yesterday. Use a lighter starting point today, then return to normal training as appropriate.";
    } else if (consecutive >= 4 && consecutive % 4 === 0) {
      level = "Light";
      rule = "consecutive-light";
      reason = `This is day ${consecutive} in a run of scheduled training days. The plan uses a lighter starting point every fourth day, keeping your session in place.`;
    } else if (feedback) {
      rule = "recent-effort";
      reason = `${recentHard.length} of your last ${actuals.length} logged sessions in the past seven days were Hard. Start moderate for this short window; those ratings do not tell us your recovery status.`;
    } else if (sameDay > 1) {
      rule = "double-day";
      reason = `You have ${sameDay} training sessions on this day. A moderate starting point keeps the combined plan from becoming several hard sessions.`;
    } else if (nearbyHard) {
      rule = "hard-spacing";
      reason =
        "A nearby session was logged or planned Hard. Keep this session moderate to space demanding work.";
    } else if (consecutive >= 3) {
      rule = "consecutive-moderate";
      reason =
        "This sits within a run of training days. Keep it productive with a moderate demand.";
    } else if (
      session.kind !== "other" &&
      plannedHardCount +
        hardSessions(week) -
        (session.intensityOverride === "Hard" ? 1 : 0) <
        limit
    ) {
      level = "Hard";
      rule = dense ? "dense-hard-opportunity" : "hard-opportunity";
      reason = dense
        ? "One demanding opportunity in a busy week; the other sessions start lighter or moderate."
        : "An opportunity for demanding work, spaced from other hard sessions in this plan.";
    } else if (session.kind === "other") {
      rule = "generic";
      reason =
        "The activity is unspecified. Use a manageable starting point and adjust what that means for your session.";
    } else {
      rule = "weekly-balance";
      reason =
        "Keep normal, productive work alongside the week's limited hard opportunities.";
    }
    result.set(session.id, {
      level,
      rule,
      reason,
      focus: intensityFocus(session.kind, level),
      generatedOn: asOf,
      engineVersion: INTENSITY_VERSION,
    });
    if (!session.intensityOverride && level === "Hard") {
      hardDates.add(session.date);
      allocated.set(week, plannedHardCount + 1);
    }
  }
  return result;
}

/** Extend the near-term routine so a Sunday setup can also show next week. */
export function refreshIntensityPlan(
  data: TrackerData,
  asOf: string,
): TrackerData {
  const expanded = materialize(
    data,
    weekStart(addDays(asOf, -7)),
    addDays(weekStart(addDays(asOf, 13)), 6),
  );
  const recommendations = recommendIntensities(expanded, asOf);
  let changed = expanded !== data;
  const sessions = expanded.sessions.map((session) => {
    const recommendation = recommendations.get(session.id);
    if (
      !recommendation ||
      JSON.stringify(session.recommendation) === JSON.stringify(recommendation)
    )
      return session;
    changed = true;
    return { ...session, recommendation };
  });
  return changed ? { ...expanded, sessions } : data;
}
