import { addDays, dateRange, weekday, today } from "./dates";
import {
  defaultProfile,
  identity,
  profileSchema,
  setupDraftSchema,
  type Dataset,
  type Plan,
  type Profile,
  type SetupDraft,
  type WeeklyRule,
} from "./models";
export function initialSetup(
  dataset: Dataset,
  timezone = defaultProfile().timezone,
): SetupDraft {
  return {
    id: dataset,
    dataset,
    step: 1,
    name: "",
    timezone,
    tournaments: [],
    rules: [],
    restDays: [],
    unavailableDays: [],
    primaryGoal: "Balanced athletic development",
    secondaryGoals: [],
    contextNotes: "",
    updatedAt: new Date().toISOString(),
  };
}
export function futureFromWeek(
  rules: WeeklyRule[],
  restDays: number[],
  unavailableDays: number[],
  date: string,
  dataset: Dataset,
  days = 14,
): Plan[] {
  return dateRange(date, days).flatMap<Plan>((day) => {
    const w = weekday(day);
    if (restDays.includes(w) || unavailableDays.includes(w))
      return [
        {
          ...identity(dataset),
          date: day,
          time: "",
          title: unavailableDays.includes(w) ? "Unavailable" : "Rest day",
          category: "Mobility" as const,
          subtype: "",
          duration: 0,
          rpe: null,
          notes: "Protected in your typical week.",
          status: "rest" as const,
          locked: false,
          origin: "weekly" as const,
          provisional: true,
        },
      ];
    return rules
      .filter((r) => r.days.includes(w))
      .map((r) => ({
        ...identity(dataset),
        date: day,
        time: r.time,
        timeOfDay: r.timeOfDay,
        title: r.title,
        category: r.category,
        customActivity: r.customActivity,
        subtype: r.subtype,
        duration: r.durationMinutes,
        rpe: null,
        notes:
          "Provisional plan from your typical week. Adjust for competition and recovery.",
        status: "planned" as const,
        locked: false,
        origin: "weekly" as const,
        templateRuleId: r.id,
        provisional: true,
      }));
  });
}
export function setupProfile(draft: SetupDraft, existing?: Profile): Profile {
  const d = setupDraftSchema.parse(draft);
  const trainingDays = [...new Set(d.rules.flatMap((r) => r.days))].filter(
    (w) => !d.restDays.includes(w) && !d.unavailableDays.includes(w),
  );
  return profileSchema.parse({
    ...(existing ?? defaultProfile(d.dataset)),
    id: d.dataset,
    name: d.name.trim() || existing?.name || "Athlete",
    timezone: d.timezone,
    weeklyRules: d.rules,
    restDays: d.restDays,
    unavailableWeekdays: d.unavailableDays,
    preferredDays: trainingDays,
    frequency: Math.max(
      0,
      d.rules.reduce(
        (n, r) => n + r.days.filter((w) => trainingDays.includes(w)).length,
        0,
      ),
    ),
    goals: [d.primaryGoal, ...d.secondaryGoals].join("; "),
    primaryGoal: d.primaryGoal,
    secondaryGoals: d.secondaryGoals,
    trainingContext: d.context,
    contextDate: d.context ? today(d.timezone) : undefined,
    contextNotes: d.contextNotes,
    quickStartStatus: existing?.quickStartStatus ?? "pending",
    strengthPriority:
      d.primaryGoal === "Strength and power"
        ? "Strength and power"
        : (existing?.strengthPriority ?? "Maintain strength alongside fencing"),
    conditioningPriority:
      d.primaryGoal === "Conditioning"
        ? "Aerobic and repeat-effort capacity"
        : (existing?.conditioningPriority ?? "Support fencing demands"),
  });
}
export function typicalWeek(profile: Profile) {
  const active = (profile.weeklyRules ?? []).flatMap((r) =>
    r.days
      .filter(
        (d) =>
          !profile.restDays?.includes(d) &&
          !profile.unavailableWeekdays?.includes(d),
      )
      .map(() => r),
  );
  return {
    count: active.length,
    minutes: active.reduce((n, r) => n + (r.durationMinutes ?? 0), 0),
    unknownDuration: active.filter((r) => r.durationMinutes === null).length,
    distribution: active.reduce<Record<string, number>>(
      (a, r) => ({
        ...a,
        [r.customActivity ?? r.category]:
          (a[r.customActivity ?? r.category] ?? 0) + 1,
      }),
      {},
    ),
  };
}
export const historyEnd = (date: string) => addDays(date, -1);
