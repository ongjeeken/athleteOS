import type { WeeklyRule } from "./models";
export type Activity = {
  key: string;
  label: string;
  category: WeeklyRule["category"];
  customActivity?: string;
};
export const activityLabel = (category: string) =>
  ({ Strength: "Strength / Gym", Mobility: "Mobility / Recovery" })[category] ??
  category;
export const activityKey = (
  rule: Pick<WeeklyRule, "category" | "customActivity">,
) =>
  rule.customActivity
    ? `custom:${rule.customActivity.toLocaleLowerCase()}`
    : rule.category;
export const defaultActivities: Activity[] = (
  ["Fencing", "Strength", "Conditioning", "Mobility"] as const
).map((category) => ({
  key: category,
  label: activityLabel(category),
  category,
}));
export function routineActivities(rules: WeeklyRule[]): Activity[] {
  const found = new Map(defaultActivities.map((a) => [a.key, a]));
  for (const r of rules) {
    const key = activityKey(r);
    if (!found.has(key))
      found.set(key, {
        key,
        label: r.customActivity ?? activityLabel(r.category),
        category: r.category,
        customActivity: r.customActivity,
      });
  }
  return [...found.values()];
}
export type ActivityDefaults = Pick<
  WeeklyRule,
  "durationMinutes" | "time" | "timeOfDay" | "subtype"
>;
export const emptyActivityDefaults: ActivityDefaults = {
  durationMinutes: null,
  time: "",
  timeOfDay: "Any time",
  subtype: "",
};
export function toggleActivityDay(
  rules: WeeklyRule[],
  activity: Activity,
  day: number,
  defaults = emptyActivityDefaults,
): WeeklyRule[] {
  const selected = rules.some(
    (r) => activityKey(r) === activity.key && r.days.includes(day),
  );
  if (selected)
    return rules.flatMap((r) =>
      activityKey(r) !== activity.key || !r.days.includes(day)
        ? [r]
        : r.days.length > 1
          ? [{ ...r, days: r.days.filter((d) => d !== day) }]
          : [],
    );
  return [...rules, anotherActivitySession(activity, day, defaults)];
}
export function anotherActivitySession(
  activity: Activity,
  day: number,
  defaults = emptyActivityDefaults,
): WeeklyRule {
  return {
    id: crypto.randomUUID(),
    title: activity.customActivity ?? `${activity.category} session`,
    category: activity.category,
    customActivity: activity.customActivity,
    days: [day],
    ...defaults,
  };
}
export function routineSummary(
  rules: WeeklyRule[],
  rest: number[] = [],
  unavailable: number[] = [],
) {
  const active = rules.flatMap((r) =>
    r.days
      .filter((d) => !rest.includes(d) && !unavailable.includes(d))
      .map(() => r),
  );
  return {
    count: active.length,
    knownMinutes: active.reduce((n, r) => n + (r.durationMinutes ?? 0), 0),
    unknownDuration: active.filter((r) => r.durationMinutes === null).length,
  };
}
export function changeRuleOccurrence(
  rules: WeeklyRule[],
  id: string,
  day: number,
  patch: Partial<WeeklyRule>,
): WeeklyRule[] {
  return rules.flatMap((r) =>
    r.id !== id || !r.days.includes(day)
      ? [r]
      : r.days.length === 1
        ? [{ ...r, ...patch }]
        : [
            { ...r, days: r.days.filter((d) => d !== day) },
            { ...r, ...patch, id: crypto.randomUUID(), days: [day] },
          ],
  );
}
export const durationLabel = (minutes: number | null) =>
  minutes === null ? "Duration unknown" : `${minutes} min`;

export type RoutineEditRequest = {
  original: import("./models").Plan;
  changed: import("./models").Plan;
  scope: "future" | "usual";
};
export function applyRoutineEdit(
  rules: WeeklyRule[],
  request: RoutineEditRequest,
): WeeklyRule[] {
  const { original, changed } = request;
  const target =
    rules.find((r) => r.id === original.templateRuleId) ??
    rules.find(
      (r) =>
        r.category === original.category &&
        (r.customActivity ?? "") === (original.customActivity ?? "") &&
        r.title === original.title,
    );
  const day = new Date(changed.date + "T12:00:00Z").getUTCDay(),
    previousDay = new Date(original.date + "T12:00:00Z").getUTCDay();
  const value: WeeklyRule = {
    id: target?.id ?? crypto.randomUUID(),
    title: changed.title,
    category: changed.category,
    customActivity: changed.customActivity,
    durationMinutes: changed.duration,
    time: changed.time,
    timeOfDay: changed.timeOfDay,
    subtype: changed.subtype,
    days: target
      ? target.days.map((d) => (d === previousDay ? day : d))
      : [day],
  };
  return target
    ? rules.map((r) => (r.id === target.id ? value : r))
    : [...rules, value];
}
