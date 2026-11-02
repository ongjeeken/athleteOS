import type { Data, Phase, Plan } from "./models";
import { addDays, daysBetween, weekday } from "./dates";
import { baseline, workload, loadEligible } from "./analytics";
export const PLANNER_VERSION = "1.1" as const;
export type Suggestion = {
  key: string;
  title: string;
  text: string;
  why: string;
  uncertainty: string;
  classification: "Planning heuristic" | "Personal observation";
  inputIds: string[];
  planId?: string;
  newDuration?: number;
  newDate?: string;
  actionLabel?: string;
};
export type PlanningResult = {
  phase: Phase;
  provisional: boolean;
  automaticPhase: Phase;
  reason: string;
  observations: string[];
  suggestions: Suggestion[];
  horizon: { date: string; phase: Phase; eventIds: string[] }[];
};
export function planTraining(data: Data, date: string): PlanningResult {
  const p = data.profile;
  if (!p)
    return {
      phase: "Insufficient Data",
      provisional: true,
      automaticPhase: "Insufficient Data",
      reason: "Set up your athlete profile to begin.",
      observations: [],
      suggestions: [],
      horizon: [],
    };
  const history = data.sessions.filter(
    (s) => s.date <= date && s.date >= addDays(date, -27),
  );
  const knownHistory = history.filter(loadEligible);
  const sufficient =
    knownHistory.length >= 4 &&
    new Set(knownHistory.map((s) => s.date)).size >= 3;
  const hasTypicalWeek = !!p.weeklyRules?.length;
  const hasProvisionalSetup = p.weeklyRules !== undefined;
  const upcoming = data.tournaments
    .filter((t) => t.endDate >= date)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const active = upcoming.filter(
    (t) => t.startDate <= addDays(date, p.windows[t.priority]),
  );
  const focus = [...active].sort(
    (a, b) =>
      a.priority.localeCompare(b.priority) ||
      a.startDate.localeCompare(b.startDate),
  )[0];
  const latest = data.checkIns.find((c) => c.date === date);
  const b = baseline(data.checkIns, date);
  const fatigue = !!(
    latest &&
    b.valid &&
    (latest.fatigue >= b.values.fatigue! + 1 ||
      latest.soreness >= b.values.soreness! + 1 ||
      latest.energy <= b.values.energy! - 1)
  );
  const symptoms = data.pain.filter(
    (s) =>
      s.date >= addDays(date, -2) &&
      s.date <= date &&
      (s.severity >= 5 || s.trend === "Worsening"),
  );
  const recentCompetition = history.filter(
    (s) =>
      s.category === "Competition" &&
      s.date >= addDays(date, -p.postCompetitionDays),
  );
  const recentCheck = data.checkIns
    .filter((c) => c.date >= addDays(date, -2) && c.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const recoveryNeeded =
    fatigue ||
    symptoms.length > 0 ||
    recentCompetition.some((s) => (s.postFatigue ?? 0) >= 7) ||
    (recentCompetition.length > 0 &&
      (!recentCheck || recentCheck.fatigue >= 4 || recentCheck.soreness >= 4));
  let phase: Phase = recoveryNeeded
    ? "Recover"
    : focus && focus.priority !== "C"
      ? "Taper"
      : !sufficient
        ? hasProvisionalSetup
          ? "Build"
          : "Insufficient Data"
        : upcoming.some((t) => t.startDate <= addDays(date, 14))
          ? "Maintain"
          : "Build";
  const automaticPhase = phase;
  const override = data.overrides
    .filter((o) => o.until >= date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (override) phase = override.phase;
  const future = data.plans
    .filter(
      (s) =>
        s.date >= date && s.date <= addDays(date, 13) && s.status === "planned",
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const demanding = future.find(
    (s) =>
      !s.locked &&
      s.duration !== null &&
      s.duration > p.adjustMinutes + 10 &&
      (s.category === "Strength" || (s.rpe ?? 0) >= 7),
  );
  const observations = [
    `${workload(data.sessions, date, 7).load} AU recorded in the last 7 calendar days.`,
    b.valid
      ? `Personal recovery baseline uses ${b.count} check-ins from the prior 14 days.`
      : `${b.count}/7 prior check-ins available; no quantitative recovery baseline yet.`,
    latest
      ? "Today’s recovery check-in is recorded."
      : "Today’s recovery is unknown until you check in.",
    `Goal: ${p.goals}. Strength: ${p.strengthPriority}. Conditioning: ${p.conditioningPriority}.`,
  ];
  const suggestions: Suggestion[] = [];
  let considered = 0;
  const add = (s: Suggestion) => {
    considered++;
    if (
      !data.decisions.some(
        (d) =>
          d.key === s.key &&
          (d.status === "dismissed" || d.status === "applied"),
      )
    )
      suggestions.push(s);
  };
  const adjustment = (s: Plan | undefined) =>
    s && s.duration !== null
      ? {
          planId: s.id,
          newDuration: Math.max(10, s.duration - p.adjustMinutes),
          actionLabel: `Reduce to ${Math.max(10, s.duration - p.adjustMinutes)} min`,
        }
      : {};
  if (
    p.trainingContext &&
    p.trainingContext !== "No unusual constraints" &&
    p.contextDate &&
    p.contextDate >= addDays(date, -13) &&
    p.contextDate <= date
  )
    add({
      key: `context-${p.trainingContext}-${date}`,
      title: "Keep your current context in view",
      text: `You noted: ${p.trainingContext.toLowerCase()}. ${p.contextNotes || "Review today’s demands and record how you feel when useful."}`,
      why: "This is a self-reported setup consideration, separate from a recovery measurement.",
      uncertainty:
        "This does not establish accumulated fatigue, readiness, or an injury diagnosis.",
      classification: "Personal observation",
      inputIds: [p.id],
    });
  if (symptoms.length)
    add({
      key: `pain-${symptoms[0].id}-${symptoms[0].updatedAt}`,
      title: "Give reported symptoms some attention",
      text: `You reported ${symptoms[0].location} symptoms (${symptoms[0].severity}/10, ${symptoms[0].trend.toLowerCase()}). Review demanding training and seek an appropriate professional assessment.`,
      why: "Recent symptom severity or worsening symptoms take precedence over a development block.",
      uncertainty:
        "Self-reported symptoms do not identify a diagnosis or determine a rehabilitation plan.",
      classification: "Personal observation",
      inputIds: symptoms.map((s) => s.id),
    });
  if (recoveryNeeded)
    add({
      key: `recovery-${date}-${latest?.updatedAt ?? recentCompetition[0]?.id ?? "pain"}`,
      title: fatigue
        ? "Fatigue has moved above your usual level"
        : "Make room for recovery",
      text: fatigue
        ? `Today’s fatigue is ${latest!.fatigue}/5 (baseline ${b.values.fatigue}) and soreness is ${latest!.soreness}/5 (baseline ${b.values.soreness}). Consider a shorter demanding session.`
        : "Recent competition exposure or reported symptoms warrant reviewing the next demanding session.",
      why: "A lower-fatigue session may help you balance training with current observations.",
      uncertainty:
        "The suggested minutes are your editable planning rule, not a validated recovery prescription. Recovery cannot be inferred from time alone.",
      classification: "Personal observation",
      inputIds: [
        ...recentCompetition.map((s) => s.id),
        ...(latest ? [latest.id] : []),
        ...symptoms.map((s) => s.id),
      ],
      ...adjustment(demanding),
    });
  const close = upcoming.filter((t) => t.startDate <= addDays(date, 13));
  if (close.length >= 2) {
    const primary = [...close].sort((a, b) =>
      a.priority.localeCompare(b.priority),
    )[0];
    add({
      key: `cluster-${close.map((t) => t.id + t.startDate + t.priority).join("-")}`,
      title: "Plan these competitions as one block",
      text: `${close.length} tournaments fall in the next 14 days. Prioritize ${primary.name} (${primary.priority}) and review recovery between events instead of repeating full tapers.`,
      why: "Overlapping competition commitments leave less time for development and recovery.",
      uncertainty:
        "Tournament duration is not training load. Log actual active exercise time and RPE after each event.",
      classification: "Planning heuristic",
      inputIds: close.map((t) => t.id),
      ...(!recoveryNeeded ? adjustment(demanding) : {}),
    });
  } else if (focus && focus.priority !== "C")
    add({
      key: `taper-${focus.id}-${focus.startDate}-${focus.priority}-${p.windows[focus.priority]}`,
      title: `Keep the quality. Ease the volume.`,
      text: `${focus.name} is ${daysBetween(date, focus.startDate) <= 0 ? "underway" : `in ${daysBetween(date, focus.startDate)} days`}. Your ${focus.priority}-priority preparation window is ${p.windows[focus.priority]} days. ${focus.priority === "A" ? "Consider reducing high-fatigue work while preserving fencing sharpness." : "Consider a smaller, shorter adjustment while continuing development."}`,
      why: "This event is inside your configured preparation window.",
      uncertainty:
        "A/B windows and duration changes are product heuristics, not established fencing prescriptions.",
      classification: "Planning heuristic",
      inputIds: [focus.id],
      ...(!recoveryNeeded ? adjustment(demanding) : {}),
    });
  const unavailable = future.find(
    (s) =>
      !s.locked &&
      (data.tournaments.some(
        (t) => s.date >= t.startDate && s.date <= t.endDate,
      ) ||
        p.unavailableDates.includes(s.date) ||
        (p.preferredDays.length > 0 &&
          !p.preferredDays.includes(weekday(s.date))) ||
        !!p.unavailableWeekdays?.includes(weekday(s.date)) ||
        !!p.restDays?.includes(weekday(s.date)) ||
        data.plans.some((r) => r.date === s.date && r.status === "rest")),
  );
  if (unavailable) {
    const available = Array.from({ length: 14 }, (_, i) =>
      addDays(unavailable.date, i + 1),
    ).find(
      (d) =>
        d <= addDays(date, 41) &&
        (p.preferredDays.length === 0 ||
          p.preferredDays.includes(weekday(d))) &&
        !p.unavailableWeekdays?.includes(weekday(d)) &&
        !p.restDays?.includes(weekday(d)) &&
        !p.unavailableDates.includes(d) &&
        !data.plans.some((s) => s.date === d && s.status === "rest") &&
        !data.tournaments.some(
          (t) =>
            d >= addDays(t.startDate, -p.windows[t.priority]) && d <= t.endDate,
        ),
    );
    add({
      key: `availability-${unavailable.id}-${unavailable.date}-${p.preferredDays.join("")}-${p.unavailableDates.join("")}`,
      title: "A session falls outside your availability",
      text: `${unavailable.title} on ${unavailable.date} conflicts with a competition commitment, protected rest day, or your availability.`,
      why: "The plan should fit your actual week, including protected rest days.",
      uncertainty: "Check your commitments before moving this session.",
      classification: "Planning heuristic",
      inputIds: [unavailable.id],
      ...(available
        ? {
            planId: unavailable.id,
            newDate: available,
            actionLabel: `Move to ${available}`,
          }
        : {}),
    });
  }
  if (!sufficient && considered === 0)
    add({
      key: `sparse-${date}`,
      title: "Build your picture, one session at a time",
      text: "Use your planned week as a starting point. Record actual sessions and optional recovery check-ins as you train; historical data is not required.",
      why: "There is too little recent training history for a personal workload interpretation.",
      uncertainty:
        "Four sessions is a conservative product threshold; missing sessions and check-ins remain unknown.",
      classification: "Planning heuristic",
      inputIds: history.map((s) => s.id),
    });
  if (sufficient && considered === 0)
    add({
      key: `development-${date}`,
      title: "Keep your training connected to your goals",
      text: `Use available days to work on ${p.strengthPriority.toLowerCase()} and ${p.conditioningPriority.toLowerCase()}. Aim for your preferred ${p.frequency} sessions per week, adjusting for recovery.`,
      why: `Your next 14 days have ${future.length} planned sessions; ${data.plans.filter((s) => s.status === "rest" && s.date >= date && s.date <= addDays(date, 13)).length} rest days are protected. C-priority events do not trigger a default full taper.`,
      uncertainty:
        "Goals and availability guide planning, not a universal ideal workload.",
      classification: "Planning heuristic",
      inputIds: future.map((s) => s.id),
    });
  const reason = override
    ? `Your override: ${override.reason}. Automatic suggestion: ${automaticPhase}.`
    : recoveryNeeded
      ? "Recent recovery observations warrant reviewing training demands."
      : focus && focus.priority !== "C"
        ? `${focus.name} is inside your ${focus.priority}-priority preparation window.`
        : !sufficient
          ? hasProvisionalSetup
            ? `Provisional development plan based on your ${hasTypicalWeek ? "typical week" : "training objective"}. Actual accumulated load and recovery are still unknown.`
            : "Log actual training as you go; history is optional and your initial guidance is provisional."
          : phase === "Maintain"
            ? "A competition is approaching. Balance development with quality and recovery."
            : "There is room to develop your priorities between competitions.";
  return {
    phase,
    provisional: !sufficient || !b.valid,
    automaticPhase,
    reason,
    observations,
    suggestions: suggestions.slice(0, 3),
    horizon: Array.from({ length: 42 }, (_, i) => {
      const d = addDays(date, i);
      const events = upcoming.filter(
        (t) =>
          d >= addDays(t.startDate, -p.windows[t.priority]) && d <= t.endDate,
      );
      return {
        date: d,
        phase: events.some((t) => t.priority !== "C")
          ? "Taper"
          : events.length
            ? "Maintain"
            : sufficient || hasProvisionalSetup
              ? "Build"
              : "Insufficient Data",
        eventIds: events.map((t) => t.id),
      };
    }),
  };
}
