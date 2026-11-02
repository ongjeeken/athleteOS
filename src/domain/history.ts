import { z } from "zod";
import { addDays, dateRange, weekday } from "./dates";
import {
  historySchema,
  identity,
  type Data,
  type Dataset,
  type HistoricalRecord,
  type Provenance,
} from "./models";
export { weeklyRuleSchema } from "./models";
import { weeklyRuleSchema, type WeeklyRule } from "./models";
export type { WeeklyRule } from "./models";
export type Candidate = HistoricalRecord & {
  included: boolean;
  duplicateOf?: string;
  warnings: string[];
};
export type ImportResult = { records: Candidate[]; warnings: string[] };
export function reconstruct(
  rules: WeeklyRule[],
  weeks: number,
  end: string,
  dataset: Dataset,
): Candidate[] {
  if (!Number.isInteger(weeks) || weeks < 2 || weeks > 6)
    throw new Error("Choose 2–6 weeks.");
  const valid = z.array(weeklyRuleSchema).min(1).parse(rules),
    batchId = crypto.randomUUID();
  return dateRange(addDays(end, 1 - weeks * 7), weeks * 7).flatMap((date) =>
    valid
      .filter((rule) => rule.days.includes(weekday(date)))
      .map((rule) => ({
        ...identity(dataset),
        batchId,
        source: "weekly" as const,
        sourceName: `Typical week · ${weeks} weeks`,
        sourceKey: `weekly:${rule.id}:${date}`,
        sourceTimezone: "",
        date,
        endDate: date,
        time: rule.time,
        timeOfDay: rule.timeOfDay,
        title: rule.title,
        category: rule.category,
        customActivity: rule.customActivity,
        kind: "session" as const,
        priority: "C" as const,
        durationMinutes: rule.durationMinutes,
        rpe: null,
        estimatedFields: [
          ...(rule.durationMinutes === null
            ? []
            : ["durationMinutes" as const]),
          ...(!rule.time ? ["time" as const] : []),
        ] as HistoricalRecord["estimatedFields"],
        status: "unconfirmed" as const,
        notes: "Reconstructed from the athlete’s typical weekly schedule.",
        included: true,
        warnings: [],
      })),
  );
}
export function guessActivity(title: string): {
  category: HistoricalRecord["category"];
  likelyTraining: boolean;
  kind: HistoricalRecord["kind"];
} {
  const t = title.toLowerCase();
  if (/\b(tournament|championships?|fencing cup|fencing open)\b/.test(t))
    return {
      category: "Competition",
      likelyTraining: true,
      kind: "tournament",
    };
  if (
    /\b(fenc(?:e|ing)|sparring|footwork|sabre|saber|epee|épée|foil|piste)\b/.test(
      t,
    )
  )
    return { category: "Fencing", likelyTraining: true, kind: "session" };
  if (/\b(strength|gym|weights?|lifting|squat|deadlift|resistance)\b/.test(t))
    return { category: "Strength", likelyTraining: true, kind: "session" };
  if (
    /\b(conditioning|run|running|cycling|cycle|swim|rowing|intervals?|cardio)\b/.test(
      t,
    )
  )
    return { category: "Conditioning", likelyTraining: true, kind: "session" };
  if (/\b(mobility|stretch(?:ing)?|yoga|recovery|pilates)\b/.test(t))
    return { category: "Mobility", likelyTraining: true, kind: "session" };
  if (/\b(training|workout|practice)\b/.test(t))
    return { category: "Other", likelyTraining: true, kind: "session" };
  return { category: "Other", likelyTraining: false, kind: "session" };
}
const normalized = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function detectDuplicates(
  rows: Candidate[],
  data: Pick<Data, "sessions" | "tournaments" | "history">,
): Candidate[] {
  const seen: Candidate[] = [];
  const matchedExisting = new Set<string>();
  const duplicateOrigins = new Map<string, string>();
  return rows.map((row) => {
    const distinctWeeklyRule = (source?: string, sourceKey?: string) =>
      row.source === "weekly" &&
      source === "weekly" &&
      sourceKey !== row.sourceKey;
    const matches = (other: {
      date: string;
      time: string;
      title: string;
      durationMinutes: number | null;
    }) =>
      row.date === other.date &&
      normalized(row.title) === normalized(other.title) &&
      (row.time === other.time ||
        row.durationMinutes === other.durationMinutes);
    const existing = data.sessions.find(
      (s) =>
        !matchedExisting.has(s.id) &&
        (s.provenance?.sourceKey === row.sourceKey || matches(s)),
    );
    const event = data.tournaments.find(
      (t) =>
        row.kind === "tournament" &&
        !matchedExisting.has(t.id) &&
        t.startDate === row.date &&
        normalized(t.name) === normalized(row.title),
    );
    const historical = data.history.find(
      (h) =>
        !matchedExisting.has(h.id) &&
        !rows.some((r) => r.id === h.id) &&
        !data.sessions.some((s) => s.id === h.completedSessionId) &&
        !data.tournaments.some((t) => t.id === h.tournamentId) &&
        (h.sourceKey === row.sourceKey || matches(h)),
    );
    const inBatch = seen.find(
      (h) =>
        h.sourceKey === row.sourceKey ||
        (!distinctWeeklyRule(h.source, h.sourceKey) && matches(h)),
    );
    seen.push(row);
    const duplicateOf =
      existing?.id ??
      event?.id ??
      historical?.id ??
      (inBatch ? (duplicateOrigins.get(inBatch.id) ?? inBatch.id) : undefined);
    if (duplicateOf) duplicateOrigins.set(row.id, duplicateOf);
    if (duplicateOf) matchedExisting.add(duplicateOf);
    return {
      ...row,
      duplicateOf,
      included: duplicateOf ? false : row.included,
    };
  });
}
export function provenance(record: HistoricalRecord): Provenance {
  return {
    source: record.source,
    sourceName: record.sourceName,
    sourceKey: record.sourceKey,
    timezone: record.sourceTimezone,
    estimatedFields: record.estimatedFields,
    confirmationStatus: "completed",
    confirmedAt: new Date().toISOString(),
    historyId: record.id,
  };
}
export function validateReview(rows: Candidate[], date: string) {
  const included = rows.filter((r) => r.included);
  if (!included.length)
    throw new Error(
      "Include at least one record, or skip history to continue.",
    );
  included.forEach((r) => {
    historySchema.parse(r);
    if (r.kind === "session" && r.date >= date)
      throw new Error(
        `${r.title}: historical sessions must be before today. Log today’s training from Today.`,
      );
    if (
      r.status === "completed" &&
      r.kind === "session" &&
      r.durationMinutes === null
    )
      throw new Error(
        `${r.title}: add a duration before confirming completion, or leave it unconfirmed.`,
      );
  });
  return included;
}
export function historyQuality(data: Data, date: string) {
  const recent = data.sessions.filter(
    (s) => s.date >= addDays(date, -27) && s.date <= date,
  );
  return {
    confirmed: recent.length,
    missingRpe: recent.filter((s) => s.rpe === null).length,
    estimated: recent.filter((s) =>
      s.provenance?.estimatedFields.includes("durationMinutes"),
    ).length,
    unconfirmed: data.history.filter((h) => h.status === "unconfirmed").length,
    missed: data.history.filter((h) => h.status === "missed").length,
    minutes: recent.reduce((n, s) => n + s.durationMinutes, 0),
    actualMinutes: recent
      .filter((s) => !s.provenance?.estimatedFields.includes("durationMinutes"))
      .reduce((n, s) => n + s.durationMinutes, 0),
    estimatedMinutes: recent
      .filter((s) => s.provenance?.estimatedFields.includes("durationMinutes"))
      .reduce((n, s) => n + s.durationMinutes, 0),
  };
}

export const sortCandidates = (rows: Candidate[]) =>
  [...rows].sort((a, b) =>
    (a.date + a.time + a.title).localeCompare(b.date + b.time + b.title),
  );
