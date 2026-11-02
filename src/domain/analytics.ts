import type { CheckIn, Session, Plan } from "./models";
import { addDays, dateRange, weekStart } from "./dates";
export function sessionLoad(
  duration: number | null,
  rpe: number | null | undefined,
): number | null {
  return rpe === null ||
    duration === null ||
    rpe === undefined ||
    !Number.isFinite(rpe) ||
    !Number.isFinite(duration)
    ? null
    : duration * rpe;
}
export function plannedLoad(plans: Plan[]): number | null {
  const rows = plans.filter((p) => p.status === "planned");
  if (rows.some((p) => p.duration === null || p.rpe === null)) return null;
  return rows.reduce((n, p) => n + p.duration! * p.rpe!, 0);
}
export function uniqueSessions(sessions: Session[]) {
  return [...new Map(sessions.map((s) => [s.id, s])).values()];
}
export function loadEligible(s: Session) {
  return (
    s.rpe !== null &&
    !s.provenance?.estimatedFields.some(
      (f) => f === "durationMinutes" || f === "rpe",
    )
  );
}
export function workload(sessions: Session[], end: string, days: number) {
  const rows = uniqueSessions(sessions).filter(
    (s) => s.date >= addDays(end, 1 - days) && s.date <= end,
  );
  const known = rows.filter(
    (s) => loadEligible(s) && sessionLoad(s.durationMinutes, s.rpe) !== null,
  );
  return {
    load: known.reduce((n, s) => n + sessionLoad(s.durationMinutes, s.rpe)!, 0),
    count: rows.length,
    minutes: rows.reduce((n, s) => n + s.durationMinutes, 0),
    estimatedCount: rows.filter((s) =>
      s.provenance?.estimatedFields.includes("durationMinutes"),
    ).length,
    missing: rows.length - known.length,
    days: new Set(rows.map((s) => s.date)).size,
  };
}
export function dailyLoad(sessions: Session[], start: string, days: number) {
  return dateRange(start, days).map((date) => {
    const w = workload(sessions, date, 1);
    return {
      date,
      load: w.count === 0 ? null : w.missing === w.count ? null : w.load,
      missing: w.missing,
      count: w.count,
    };
  });
}
export function weeklyLoad(sessions: Session[], end: string, weeks = 6) {
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(weekStart(end), -(weeks - 1 - i) * 7);
    return { date: start, ...workload(sessions, addDays(start, 6), 7) };
  });
}
export function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
export const wellnessKeys = [
  "sleep",
  "energy",
  "fatigue",
  "soreness",
  "stress",
] as const;
export function baseline(checkIns: CheckIn[], date: string) {
  const prior = [
    ...new Map(
      checkIns
        .filter(
          (c) =>
            c.date >= addDays(date, -14) &&
            c.date < date &&
            wellnessKeys.every(
              (k) => Number.isFinite(c[k]) && c[k] >= 1 && c[k] <= 5,
            ),
        )
        .map((c) => [c.date, c]),
    ).values(),
  ];
  return {
    count: prior.length,
    valid: prior.length >= 7,
    values: Object.fromEntries(
      wellnessKeys.map((k) => [
        k,
        prior.length >= 7 ? median(prior.map((c) => c[k])) : null,
      ]),
    ) as Record<(typeof wellnessKeys)[number], number | null>,
  };
}

/** Known sums are partial when RPE is missing; an entirely unknown sum has no numeric label. */
export function workloadLabel(value: {
  load: number;
  count: number;
  missing: number;
}): string {
  return value.count > 0 && value.count === value.missing
    ? "Unknown"
    : value.load.toLocaleString();
}
