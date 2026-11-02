import { addDays, dateRange, daysBetween, weekday, weekStart } from "./dates";
import { guessActivity } from "./history";
import {
  dateSchema,
  identity,
  weeklyRuleSchema,
  type Data,
  type Dataset,
  type Plan,
  type Session,
  type WeeklyRule,
} from "./models";
import { activityKey } from "./routine";
import { median } from "./analytics";
export type TimeOfDay = NonNullable<WeeklyRule["timeOfDay"]>;
export function dayPart(time: string, recorded?: TimeOfDay): TimeOfDay {
  if (!time) return recorded ?? "Any time";
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}
export function historyRange(date: string, weeks = 4) {
  const end = addDays(weekStart(date), -1);
  return { start: addDays(end, 1 - weeks * 7), end };
}
export type PatternOptions = {
  minShare: number;
  minOccurrences: number;
  includeEstimates: boolean;
  outlierRatio: number;
  copyWeek?: boolean;
};
export const defaultPatternOptions: PatternOptions = {
  minShare: 0.5,
  minOccurrences: 2,
  includeEstimates: false,
  outlierRatio: 1.75,
};
export type DetectedPattern = {
  rule: WeeklyRule;
  included: boolean;
  reason: string;
  sourceIds: string[];
  occurrences: number;
  opportunities: number;
  estimated: boolean;
};
export type PatternResult = {
  patterns: DetectedPattern[];
  excluded: { session: Session; reason: string }[];
  observedEmptyDays: number[];
  sourceStart: string;
  sourceEnd: string;
};
export function detectPatterns(
  sessions: Session[],
  start: string,
  end: string,
  options = defaultPatternOptions,
): PatternResult {
  dateSchema.parse(start);
  dateSchema.parse(end);
  if (start > end || daysBetween(start, end) > 366)
    throw new Error("Choose up to one year of completed training.");
  if (
    options.minShare <= 0 ||
    options.minShare > 1 ||
    options.minOccurrences < 1 ||
    !Number.isInteger(options.minOccurrences) ||
    options.outlierRatio <= 1
  )
    throw new Error(
      "Use a recurrence threshold of 1–100%, at least one occurrence and an outlier multiplier above one.",
    );
  const inRange = sessions.filter((s) => s.date >= start && s.date <= end);
  const excluded: PatternResult["excluded"] = [];
  const eligible = inRange.filter((s) => {
    const reason =
      s.category === "Competition"
        ? "Competition is an exceptional event, not a weekly workout."
        : /\b(camp|one[ -]off|exceptional)\b/i.test(s.title + " " + s.subtype)
          ? "Marked as a camp or exceptional session."
          : !options.includeEstimates &&
              s.provenance?.estimatedFields.includes("durationMinutes")
            ? "Duration is an athlete-confirmed estimate. Enable estimates to consider it."
            : "";
    if (reason) excluded.push({ session: s, reason });
    return !reason;
  });
  // Rank independent same-category sessions within a recorded day and time band.
  // Ordinal slots keep two untimed fencing sessions independent rather than merging them.
  const daily = new Map<string, Session[]>();
  for (const s of eligible) {
    const k = [s.date, activityKey(s), dayPart(s.time, s.timeOfDay)].join("|");
    daily.set(k, [...(daily.get(k) ?? []), s]);
  }
  const groups = new Map<string, Session[]>();
  for (const values of daily.values()) {
    values.sort(
      (a, b) =>
        a.time.localeCompare(b.time) ||
        a.durationMinutes - b.durationMinutes ||
        a.id.localeCompare(b.id),
    );
    values.forEach((s, slot) => {
      const k = [
        weekday(s.date),
        activityKey(s),
        dayPart(s.time, s.timeOfDay),
        slot,
      ].join("|");
      groups.set(k, [...(groups.get(k) ?? []), s]);
    });
  }
  const patterns: DetectedPattern[] = [];
  for (const rows of groups.values()) {
    const typical = median(rows.map((s) => s.durationMinutes)) ?? 0;
    const kept = rows.filter((s) => {
      if (
        rows.length >= 3 &&
        s.durationMinutes > typical * options.outlierRatio
      ) {
        excluded.push({
          session: s,
          reason: `Unusually long compared with the ${typical}-minute median (threshold ${options.outlierRatio}×).`,
        });
        return false;
      }
      return true;
    });
    if (!kept.length) continue;
    const first = kept[0],
      day = weekday(first.date);
    const opportunities = dateRange(start, daysBetween(start, end) + 1).filter(
      (d) => weekday(d) === day,
    ).length;
    const count = kept.length;
    const included = options.copyWeek
      ? true
      : count >= options.minOccurrences &&
        count / opportunities >= options.minShare;
    const estimated = kept.some((s) =>
      s.provenance?.estimatedFields.includes("durationMinutes"),
    );
    patterns.push({
      rule: {
        id: crypto.randomUUID(),
        title: first.title,
        category: first.category,
        customActivity: first.customActivity,
        subtype: first.subtype,
        days: [day],
        durationMinutes: Math.max(
          1,
          Math.round(median(kept.map((s) => s.durationMinutes))!),
        ),
        time: "",
        timeOfDay: dayPart(first.time, first.timeOfDay),
      },
      included,
      occurrences: count,
      opportunities,
      estimated,
      sourceIds: kept.map((s) => s.id),
      reason: `${count} of ${opportunities} observed ${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][day]}; ${options.copyWeek ? "one-week copy selected" : included ? "meets your recurrence threshold" : "inconsistent or too few observations — choose whether to include"}. Median duration${estimated ? " includes confirmed estimates" : " from reported durations"}.`,
    });
  }
  return {
    patterns,
    excluded,
    observedEmptyDays: [1, 2, 3, 4, 5, 6, 0].filter(
      (d) => !inRange.some((s) => weekday(s.date) === d),
    ),
    sourceStart: start,
    sourceEnd: end,
  };
}
export type TextSchedule = {
  rules: WeeklyRule[];
  dated: { date: string; rule: WeeklyRule }[];
  warnings: string[];
};
const days: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
};
export function parseSchedule(text: string): TextSchedule {
  const result: TextSchedule = { rules: [], dated: [], warnings: [] };
  const lines = text.trim().split(/\r?\n/);
  if (text.length > 30000 || lines.length > 200)
    throw new Error("Paste up to 200 lines and 30,000 characters.");
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const head = line.match(
      /^\s*(Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?|\d{4}-\d{2}-\d{2})\s*:\s*(.+)$/i,
    );
    if (!head) {
      result.warnings.push(
        `Line ${index + 1}: use a weekday or ISO date followed by a colon.`,
      );
      return;
    }
    const date = /^\d/.test(head[1]) ? head[1] : undefined;
    if (date && !dateSchema.safeParse(date).success) {
      result.warnings.push(`Line ${index + 1}: invalid date.`);
      return;
    }
    for (const chunk of head[2].split(/[,;]/)) {
      const duration = chunk.match(
        /\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i,
      );
      if (!duration) {
        result.warnings.push(
          `Line ${index + 1}: “${chunk.trim()}” needs a duration such as 60m.`,
        );
        continue;
      }
      const minutes = Number(duration[1]) * (/^h/i.test(duration[2]) ? 60 : 1);
      const band = /\b(AM|morning)\b/i.test(chunk)
        ? "Morning"
        : /\b(afternoon)\b/i.test(chunk)
          ? "Afternoon"
          : /\b(PM|evening)\b/i.test(chunk)
            ? "Evening"
            : "Any time";
      const clock = chunk.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
      const title = chunk
        .replace(duration[0], "")
        .replace(/\b(AM|PM|morning|afternoon|evening)\b/gi, "")
        .replace(/\b\d{2}:\d{2}\b/, "")
        .trim();
      const guessed = guessActivity(title);
      if (
        !title ||
        minutes < 1 ||
        minutes > 720 ||
        !Number.isInteger(minutes)
      ) {
        result.warnings.push(
          `Line ${index + 1}: check activity and whole-minute duration (1–720).`,
        );
        continue;
      }
      if (!guessed.likelyTraining)
        result.warnings.push(
          `Line ${index + 1}: “${title}” is unrecognized; review its Other category.`,
        );
      if (guessed.category === "Competition") {
        result.warnings.push(
          `Line ${index + 1}: “${title}” looks like a competition; review before repeating it.`,
        );
      }
      const rule = weeklyRuleSchema.parse({
        id: crypto.randomUUID(),
        title,
        category: guessed.category,
        subtype: "",
        durationMinutes: minutes,
        days: [date ? weekday(date) : days[head[1].slice(0, 3).toLowerCase()]],
        time: clock?.[0] ?? "",
        timeOfDay: band,
      });
      result.rules.push(rule);
      if (date) result.dated.push({ date, rule });
    }
  });
  if (result.dated.length && result.dated.length !== result.rules.length)
    result.warnings.push(
      "Weekday and dated entries are mixed. Dated entries keep their dates in one-time previews; choose a recurring week only after reviewing weekdays.",
    );
  return result;
}
export type ScheduleInput = {
  dataset: Dataset;
  rules: WeeklyRule[];
  restDays: number[];
  unavailableDays: number[];
  start: string;
  end: string;
  seriesId?: string;
  batchId?: string;
};
export function generateOccurrences(input: ScheduleInput): Plan[] {
  const { dataset, rules, restDays, unavailableDays, start, end, seriesId } =
    input;
  dateSchema.parse(start);
  dateSchema.parse(end);
  const count = daysBetween(start, end) + 1;
  if (count < 1 || count > 731)
    throw new Error(
      "Choose a date range of up to two years; indefinite series extend as you use the app.",
    );
  rules.forEach((r) => weeklyRuleSchema.parse(r));
  const batchId = input.batchId ?? crypto.randomUUID();
  return dateRange(start, count).flatMap((date) =>
    restDays.includes(weekday(date)) || unavailableDays.includes(weekday(date))
      ? []
      : rules
          .filter((r) => r.days.includes(weekday(date)))
          .sort(
            (a, b) =>
              ["Morning", "Afternoon", "Evening", "Any time"].indexOf(
                dayPart(a.time, a.timeOfDay),
              ) -
                ["Morning", "Afternoon", "Evening", "Any time"].indexOf(
                  dayPart(b.time, b.timeOfDay),
                ) || a.time.localeCompare(b.time),
          )
          .map((r) => ({
            ...identity(dataset),
            date,
            time: r.time,
            timeOfDay: r.timeOfDay,
            title: r.title,
            category: r.category,
            customActivity: r.customActivity,
            subtype: r.subtype,
            duration: r.durationMinutes,
            rpe: null,
            notes:
              "Planned from a reviewed weekly schedule. Adjust for competition and recovery.",
            status: "planned" as const,
            locked: false,
            origin: "weekly" as const,
            templateRuleId: r.id,
            seriesId,
            occurrenceDate: seriesId ? date : undefined,
            occurrenceEdited: false,
            provisional: true,
            planningBatchId: batchId,
          })),
  );
}
export type PlanPreview = {
  plan: Plan;
  included: boolean;
  duplicateOf?: string;
  conflicts: string[];
};
export function previewOccurrences(plans: Plan[], data: Data): PlanPreview[] {
  const seen: Plan[] = [];
  const matchedExisting = new Set<string>();
  return plans.map((plan) => {
    const same = (p: {
      date: string;
      category: string;
      customActivity?: string;
      time: string;
      timeOfDay?: TimeOfDay;
      title: string;
      duration?: number | null;
      durationMinutes?: number;
      templateRuleId?: string;
      seriesId?: string;
    }) =>
      p.date === plan.date &&
      ((plan.seriesId &&
        p.seriesId === plan.seriesId &&
        p.templateRuleId === plan.templateRuleId) ||
        (p.category === plan.category &&
          (p.customActivity ?? "") === (plan.customActivity ?? "") &&
          p.time === plan.time &&
          (p.timeOfDay ?? "Any time") === (plan.timeOfDay ?? "Any time") &&
          (p.title.trim().toLowerCase() === plan.title.trim().toLowerCase() ||
            (p.duration ?? p.durationMinutes) === plan.duration)));
    // Distinct rules in the same proposed week are intentional independent sessions.
    const duplicate =
      data.plans.find((p) => !matchedExisting.has(p.id) && same(p)) ??
      data.sessions.find(
        (s) =>
          !matchedExisting.has(s.id) &&
          (!s.plannedSessionId ||
            !data.plans.some((p) => p.id === s.plannedSessionId)) &&
          same(s),
      ) ??
      seen.find((p) => p.templateRuleId === plan.templateRuleId && same(p));
    if (duplicate) matchedExisting.add(duplicate.id);
    seen.push(plan);
    const conflicts = data.tournaments
      .filter((t) => t.startDate <= plan.date && t.endDate >= plan.date)
      .map((t) => `${t.priority} competition: ${t.name}`);
    const prep = data.tournaments.find(
      (t) =>
        t.priority !== "C" &&
        plan.date < t.startDate &&
        plan.date >=
          addDays(t.startDate, -(data.profile?.windows[t.priority] ?? 0)),
    );
    if (prep)
      conflicts.push(
        `${prep.priority} preparation window: review training volume`,
      );
    if (
      data.profile?.unavailableDates.includes(plan.date) ||
      data.profile?.unavailableWeekdays?.includes(weekday(plan.date)) ||
      data.profile?.restDays?.includes(weekday(plan.date))
    )
      conflicts.push("Protected rest or unavailable day");
    if (
      data.plans.some(
        (p) =>
          p.date === plan.date &&
          p.time &&
          p.time === plan.time &&
          p.status === "planned" &&
          p.id !== duplicate?.id,
      )
    )
      conflicts.push("Another session starts at the same time");
    return {
      plan,
      included: !duplicate,
      duplicateOf: duplicate?.id,
      conflicts,
    };
  });
}
