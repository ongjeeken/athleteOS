import { addDays, fmt } from "../domain/dates";
import type { TrackerData } from "./model";
import { knownCompetitions } from "./intensity";
import { sessionsInWeek } from "./schedule";

/** One concise strategy; individual session explanations stay with each session. */
export function observe(data: TrackerData, start: string, asOf: string) {
  const sessions = sessionsInWeek(data, start).filter(
    (s) => s.status !== "skipped",
  );
  const upcoming = sessions.filter(
    (s) => s.date >= asOf && s.status === "planned",
  );
  const next = knownCompetitions(data).find(
    (c) =>
      c.date >= (start > asOf ? start : asOf) && c.date <= addDays(start, 10),
  );
  const hasRule = (rule: string) =>
    upcoming.some((s) => s.recommendation?.rule === rule);
  if (!sessions.length)
    return {
      title: "A starting point for your training",
      text: "Add a session or your usual routine to get Light, Moderate or Hard suggestions for the days you train.",
      reason:
        "Suggestions use your schedule, competition timing and any recent logged effort.",
    };
  if (!upcoming.length)
    return {
      title: "Your intensity plan, on record",
      text: "Saved suggestions and actual effort stay separate. Past sessions keep the guidance recorded at the time.",
      reason:
        "Older sessions may have no recorded suggestion; the app does not invent historical recommendations.",
    };
  if (
    next &&
    upcoming.some((s) => s.recommendation?.rule.startsWith("competition"))
  ) {
    const before = upcoming.filter((s) => s.date < next.date);
    const during = upcoming.filter((s) => s.date === next.date);
    const after = upcoming.filter((s) => s.date > next.date);
    const levels = new Set(before.map((s) => s.recommendation?.level));
    const intro = `${next.priority === "priority" ? "Priority competition" : "Regular competition"} on ${fmt(next.date, { weekday: "long", day: "numeric", month: "short" })}.`;
    const parts: string[] = [];
    if (before.length) {
      if (levels.size === 1 && levels.has("Light"))
        parts.push("Your pre-event sessions are suggested Light.");
      else if (levels.has("Light"))
        parts.push(
          levels.has("Hard")
            ? "Keep normal training earlier, with lighter demand nearest the event."
            : "Closer sessions use moderate or light demand as the event approaches.",
        );
      else
        parts.push(
          "Keep the closer pre-event sessions moderate, alongside normal training earlier.",
        );
    }
    if (during.length)
      parts.push("Any extra training on competition day is suggested Light.");
    if (after.length)
      parts.push("Return to your normal training rhythm afterward.");
    return {
      title:
        !before.length && during.length
          ? "Light extras on competition day"
          : next.priority === "priority"
            ? "Ease the demand before your priority event"
            : "Keep training. Ease up close to competition.",
      text: [intro, ...parts].join(" "),
      reason:
        next.priority === "priority"
          ? "This plan uses a more cautious final few days for a priority event, with suggestions tailored to each scheduled activity."
          : "Regular competitions can be part of an ongoing training cycle. The plan uses a short easing window and keeps your training days in place.",
    };
  }
  if (hasRule("after-competition"))
    return {
      title: "A lighter start after competition",
      text: "A known competition falls just before this week's training. Sessions on the following day start light; later sessions return to a normal training rhythm.",
      reason:
        "Only the day after a known competition uses this rule. It is an adjustable starting point, not an assessment of recovery.",
    };
  if (hasRule("recent-effort"))
    return {
      title: "A moderate starting point after recent hard work",
      text: "Several recent sessions were logged Hard. Upcoming suggestions briefly favour moderate work, while keeping your training days in place.",
      reason:
        "Three or more of the last five logged sessions in seven days were Hard. This only tempers hard suggestions through two days after the latest one; effort ratings are not a recovery measurement.",
    };
  if (
    hasRule("double-day") ||
    hasRule("consecutive-light") ||
    hasRule("consecutive-moderate")
  )
    return {
      title: "Keep your days. Vary the demand.",
      text: "Busy days start moderate, with lighter work in longer runs of training. Hard opportunities are limited and spaced apart.",
      reason:
        "The plan considers same-day sessions and consecutive training days together, rather than treating every session as a separate hard opportunity.",
    };
  return {
    title: "Productive training, with room between hard efforts",
    text: "Start with normal, manageable sessions and a few spaced hard opportunities. Light means reduced demand for the activity you are doing.",
    reason:
      "At most two suggested hard sessions per week, or one in a high-frequency week, before competition and recent-effort rules. Light, Moderate and Hard describe each activity differently.",
  };
}
