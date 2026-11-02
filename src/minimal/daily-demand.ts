import type { Intensity, Session, TrackerData } from "./model";
import { knownCompetitions } from "./intensity";
import { sessionsOn } from "./schedule";

export type DailyDemand = {
  level: Intensity | "Rest";
  reason: string;
  rule: string;
};

/** Qualitative combination rules, not summed workload units. Actual effort and
 * legacy duration never participate. Completed sessions stay in the day's plan;
 * skipped/removed sessions do not. Explicit athlete intensity choices take precedence. */
export function combineDailyDemand(
  sessions: Session[],
  competition = false,
): DailyDemand {
  const active = sessions.filter((s) => !s.removed && s.status !== "skipped");
  if (competition)
    return {
      level: "Hard",
      rule: "competition",
      reason:
        "A competition is scheduled. This relative plan treats the event as a Hard day, even when additional sessions are Light.",
    };
  if (!active.length)
    return {
      level: "Rest",
      rule: "rest",
      reason: "No training or recovery sessions are planned for this day.",
    };
  const planned = active.map((s) => ({
    kind: s.kind,
    level:
      s.intensityOverride ??
      s.recommendation?.level ??
      (s.kind === "recovery" ? "Light" : "Moderate"),
  }));
  const training = planned.filter((s) => s.kind !== "recovery");
  const moderate = training.filter((s) => s.level === "Moderate").length;
  const light = training.filter((s) => s.level === "Light").length;
  let result: DailyDemand;
  if (planned.some((s) => s.level === "Hard"))
    result = {
      level: "Hard",
      rule: "hard-session",
      reason:
        "At least one session is planned Hard. The overall day starts at Hard as a relative recommendation.",
    };
  else if (moderate >= 2)
    result = {
      level: "Hard",
      rule: "combined-moderate",
      reason:
        "Two or more Moderate training sessions make this a Hard day together. Recovery / mobility does not add to that count.",
    };
  else if (moderate >= 1 && light >= 2)
    result = {
      level: "Hard",
      rule: "combined-mixed",
      reason:
        "A Moderate training session plus at least two Light training sessions makes this a Hard day together. Recovery / mobility is kept separate.",
    };
  else if (light >= 3)
    result = {
      level: "Moderate",
      rule: "combined-light",
      reason:
        "Several Light training sessions combine into a Moderate day. Gentle recovery / mobility does not increase the training count.",
    };
  else if (planned.some((s) => s.level === "Moderate"))
    result = {
      level: "Moderate",
      rule: "moderate-session",
      reason:
        "A Moderate session sets a Moderate starting point. A Light session or gentle recovery alongside it does not automatically make the day Hard.",
    };
  else
    result = {
      level: "Light",
      rule: training.length ? "light-sessions" : "recovery-only",
      reason: training.length
        ? "The planned sessions are Light, with gentle recovery / mobility kept separate from demanding training."
        : "Only gentle recovery / mobility is planned. It does not count like fencing, gym or conditioning when combining sessions.",
    };
  if (active.some((s) => !s.recommendation && !s.intensityOverride))
    result = {
      ...result,
      reason: `${result.reason} Where a saved suggestion is missing, the starting point is Moderate for training and Light for recovery. No historical session recommendation is invented or saved.`,
    };
  return result;
}

export function dailyDemand(data: TrackerData, date: string) {
  return combineDailyDemand(
    sessionsOn(data, date),
    knownCompetitions(data).some((c) => c.date === date),
  );
}
