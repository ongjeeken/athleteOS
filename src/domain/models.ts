import { z } from "zod";
export const categories = [
  "Fencing",
  "Strength",
  "Conditioning",
  "Mobility",
  "Competition",
  "Other",
] as const;
export const phases = [
  "Build",
  "Maintain",
  "Taper",
  "Recover",
  "Insufficient Data",
] as const;
export type Phase = (typeof phases)[number];
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
    "Enter a valid calendar date",
  );
const base = {
  id: z.string().min(1),
  dataset: z.enum(["personal", "sample"]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
};
const text = z.string().max(5000).default("");
const rating = z.number().int().min(1).max(5);
export const timeOfDaySchema = z.enum([
  "Any time",
  "Morning",
  "Afternoon",
  "Evening",
]);
export const weeklyRuleSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(150),
  category: z.enum(categories),
  customActivity: z.string().trim().min(1).max(80).optional(),
  subtype: z.string().default(""),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Choose at least one weekday"),
  durationMinutes: z.number().int().min(1).max(720).nullable(),
  time: z.string().regex(/^$|^\d{2}:\d{2}$/),
  timeOfDay: timeOfDaySchema.optional(),
});
export type WeeklyRule = z.infer<typeof weeklyRuleSchema>;
export const templateSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(100),
  rules: z.array(weeklyRuleSchema),
  restDays: z.array(z.number().int().min(0).max(6)),
  unavailableDays: z.array(z.number().int().min(0).max(6)),
  source: z.enum(["custom", "history", "text", "typical"]),
  sourceSessionIds: z.array(z.string()),
  sourceStart: dateSchema.optional(),
  sourceEnd: dateSchema.optional(),
});
export type TrainingTemplate = z.infer<typeof templateSchema>;
export const recurrenceSchema = z
  .object({
    ...base,
    name: z.string().trim().min(1).max(100),
    templateId: z.string().optional(),
    rules: z.array(weeklyRuleSchema).min(1),
    restDays: z.array(z.number().int().min(0).max(6)),
    unavailableDays: z.array(z.number().int().min(0).max(6)),
    startDate: dateSchema,
    endDate: dateSchema.nullable(),
    generatedThrough: dateSchema,
    active: z.boolean(),
  })
  .refine(
    (r) => !r.endDate || r.endDate >= r.startDate,
    "End date must follow start date",
  );
export type RecurringSchedule = z.infer<typeof recurrenceSchema>;
export const recurrenceExceptionSchema = z.object({
  ...base,
  seriesId: z.string(),
  ruleId: z.string(),
  date: dateSchema,
  action: z.enum(["skipped", "edited"]),
  planId: z.string().optional(),
});
export type RecurrenceException = z.infer<typeof recurrenceExceptionSchema>;
export const trainingGoals = [
  "Balanced athletic development",
  "Competition performance",
  "Strength and power",
  "Conditioning",
  "Maintain current fitness",
] as const;
export const trainingContexts = [
  "No unusual constraints",
  "Recently completed a demanding competition",
  "Experiencing unusual fatigue",
  "Managing pain or injury symptoms",
  "Temporarily reduced training availability",
  "Other / prefer to describe",
] as const;
export const profileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  sport: z.string().min(1),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Use an IANA timezone, e.g. Asia/Singapore"),
  goals: text,
  preferredDays: z.array(z.number().int().min(0).max(6)),
  unavailableDates: z.array(dateSchema),
  frequency: z.number().int().min(0).max(99),
  strengthPriority: text,
  conditioningPriority: text,
  checkInReminder: z.boolean(),
  mentalTracking: z.boolean(),
  windows: z.object({
    A: z.number().int().min(0).max(21),
    B: z.number().int().min(0).max(14),
    C: z.number().int().min(0).max(7),
  }),
  adjustMinutes: z.number().int().min(5).max(60),
  postCompetitionDays: z.number().int().min(1).max(7),
  defaultRpeMode: z.enum(["quick", "detailed"]).default("quick"),
  weeklyRules: z.array(weeklyRuleSchema).optional(),
  restDays: z.array(z.number().int().min(0).max(6)).optional(),
  unavailableWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  primaryGoal: z.enum(trainingGoals).optional(),
  secondaryGoals: z.array(z.enum(trainingGoals)).optional(),
  trainingContext: z.enum(trainingContexts).optional(),
  contextNotes: z.string().optional(),
  contextDate: dateSchema.optional(),
  quickStartStatus: z.enum(["pending", "completed", "skipped"]).optional(),
  theme: z.enum(["light", "dark", "system"]),
});
export type Profile = z.infer<typeof profileSchema>;
export const provenanceSchema = z.object({
  source: z.enum(["weekly", "ics", "csv", "manual", "sample"]),
  sourceName: z.string(),
  sourceKey: z.string(),
  timezone: z.string(),
  estimatedFields: z.array(z.enum(["durationMinutes", "rpe", "time"])),
  confirmationStatus: z.literal("completed"),
  confirmedAt: z.string().datetime({ offset: true }),
  historyId: z.string().optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;
export const historySchema = z
  .object({
    ...base,
    batchId: z.string().min(1),
    source: z.enum(["weekly", "ics", "csv", "manual"]),
    sourceName: z.string(),
    sourceKey: z.string().min(1),
    sourceTimezone: z.string(),
    date: dateSchema,
    endDate: dateSchema,
    time: z.string().regex(/^$|^\d{2}:\d{2}$/),
    timeOfDay: timeOfDaySchema.optional(),
    title: z.string().min(1).max(150),
    category: z.enum(categories),
    customActivity: z.string().trim().min(1).max(80).optional(),
    kind: z.enum(["session", "tournament"]),
    priority: z.enum(["A", "B", "C"]),
    durationMinutes: z.number().positive().max(720).nullable(),
    rpe: z.number().int().min(0).max(10).nullable(),
    estimatedFields: z.array(z.enum(["durationMinutes", "rpe", "time"])),
    rpeInputMode: z.enum(["quick", "detailed"]).optional(),
    status: z.enum(["unconfirmed", "completed", "missed"]),
    notes: text,
    completedSessionId: z.string().optional(),
    tournamentId: z.string().optional(),
  })
  .refine(
    (r) => r.endDate >= r.date,
    "Historical end date must follow its start date",
  );
export type HistoricalRecord = z.infer<typeof historySchema>;
export const tournamentSchema = z
  .object({
    ...base,
    name: z.string().min(1).max(150),
    startDate: dateSchema,
    endDate: dateSchema,
    priority: z.enum(["A", "B", "C"]),
    location: text,
    notes: text,
    goal: text,
    results: text,
    provenance: provenanceSchema.optional(),
  })
  .refine(
    (t) => t.endDate >= t.startDate,
    "End date must be on or after the start date",
  );
export type Tournament = z.infer<typeof tournamentSchema>;
export const setupDraftSchema = z.object({
  id: z.string(),
  dataset: z.enum(["personal", "sample"]),
  step: z.number().int().min(1).max(3),
  importAfterSetup: z.boolean().optional(),
  name: z.string(),
  timezone: z.string(),
  tournaments: z.array(tournamentSchema),
  rules: z.array(weeklyRuleSchema),
  restDays: z.array(z.number().int().min(0).max(6)),
  unavailableDays: z.array(z.number().int().min(0).max(6)),
  primaryGoal: z.enum(trainingGoals),
  secondaryGoals: z.array(z.enum(trainingGoals)),
  context: z.enum(trainingContexts).optional(),
  contextNotes: z.string(),
  updatedAt: z.string(),
});
export type SetupDraft = z.infer<typeof setupDraftSchema>;
export const planSchema = z.object({
  ...base,
  date: dateSchema,
  time: z.string().regex(/^$|^\d{2}:\d{2}$/),
  title: z.string().min(1).max(150),
  category: z.enum(categories),
  customActivity: z.string().trim().min(1).max(80).optional(),
  subtype: text,
  duration: z.number().int().min(0).max(720).nullable(),
  rpe: z.number().min(0).max(10).nullable(),
  notes: text,
  status: z.enum(["planned", "completed", "rest"]),
  locked: z.boolean(),
  tournamentId: z.string().optional(),
  origin: z.enum(["manual", "weekly"]).optional(),
  templateRuleId: z.string().optional(),
  provisional: z.boolean().optional(),
  timeOfDay: timeOfDaySchema.optional(),
  seriesId: z.string().optional(),
  occurrenceDate: dateSchema.optional(),
  occurrenceEdited: z.boolean().optional(),
  planningBatchId: z.string().optional(),
});
export type Plan = z.infer<typeof planSchema>;
export const sessionSchema = z
  .object({
    ...base,
    date: dateSchema,
    time: z.string(),
    timeOfDay: timeOfDaySchema.optional(),
    title: z.string().min(1).max(150),
    category: z.enum(categories),
    customActivity: z.string().trim().min(1).max(80).optional(),
    durationMinutes: z.number().positive().max(720),
    rpe: z.number().int().min(0).max(10).nullable(),
    rpeInputMode: z.enum(["quick", "detailed"]),
    sessionLoad: z.number().min(0).nullable(),
    notes: text,
    provenance: provenanceSchema.optional(),
    plannedSessionId: z.string().optional(),
    tournamentId: z.string().optional(),
    subtype: text,
    bouts: z.number().int().min(0).optional(),
    activeMinutes: z.number().min(0).max(720).optional(),
    legFatigue: z.number().min(0).max(10).optional(),
    cognitiveDemand: z.number().min(0).max(10).optional(),
    modality: text,
    distance: z.number().min(0).optional(),
    emphasis: z.enum(["Lower body", "Upper body", "Full body"]).optional(),
    results: text,
    postFatigue: z.number().min(0).max(10).optional(),
  })
  .refine(
    (s) =>
      s.activeMinutes === undefined || s.activeMinutes <= s.durationMinutes,
    "Active time cannot exceed session duration",
  )
  .refine(
    (s) =>
      s.sessionLoad === (s.rpe === null ? null : s.durationMinutes * s.rpe),
    "Session load must equal actual duration × RPE, or null",
  );
export type Session = z.infer<typeof sessionSchema>;
export const checkInSchema = z.object({
  ...base,
  date: dateSchema,
  sleepHours: z.number().min(0).max(24).optional(),
  sleep: rating,
  energy: rating,
  fatigue: rating,
  soreness: rating,
  stress: rating,
  mental: rating.optional(),
  motivation: rating.optional(),
  notes: text,
});
export type CheckIn = z.infer<typeof checkInSchema>;
export const painSchema = z.object({
  ...base,
  date: dateSchema,
  location: z.string().min(1),
  severity: z.number().int().min(0).max(10),
  during: text,
  nextDay: text,
  trend: z.enum(["Improving", "Stable", "Worsening"]),
  notes: text,
});
export type Pain = z.infer<typeof painSchema>;
export const exerciseSchema = z.object({
  ...base,
  sessionId: z.string(),
  name: z.string().min(1),
  emphasis: z.enum(["Lower body", "Upper body", "Full body"]),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export const setSchema = z.object({
  ...base,
  exerciseId: z.string(),
  order: z.number().int().positive(),
  reps: z.number().int().min(1).max(500),
  weight: z.number().min(0).max(1000),
  setRpe: z.number().min(0).max(10).optional(),
  rir: z.number().min(0).max(20).optional(),
});
export type StrengthSet = z.infer<typeof setSchema>;
export const decisionSchema = z.object({
  ...base,
  key: z.string(),
  status: z.enum(["dismissed", "applied", "undone"]),
  algorithm: z.enum(["1.0", "1.1"]),
  rationale: text,
  inputIds: z.array(z.string()),
  original: planSchema.optional(),
  applied: planSchema.optional(),
});
export type Decision = z.infer<typeof decisionSchema>;
export const overrideSchema = z.object({
  ...base,
  phase: z.enum(phases),
  until: dateSchema,
  reason: z.string().min(1),
});
export type Override = z.infer<typeof overrideSchema>;
export type Dataset = "personal" | "sample";
export type Data = {
  profile?: Profile;
  templates: TrainingTemplate[];
  recurrences: RecurringSchedule[];
  recurrenceExceptions: RecurrenceException[];
  history: HistoricalRecord[];
  tournaments: Tournament[];
  plans: Plan[];
  sessions: Session[];
  checkIns: CheckIn[];
  pain: Pain[];
  exercises: Exercise[];
  sets: StrengthSet[];
  decisions: Decision[];
  overrides: Override[];
};
export const emptyData = (): Data => ({
  templates: [],
  recurrences: [],
  recurrenceExceptions: [],
  history: [],
  tournaments: [],
  plans: [],
  sessions: [],
  checkIns: [],
  pain: [],
  exercises: [],
  sets: [],
  decisions: [],
  overrides: [],
});
export function identity(dataset: Dataset, id: string = crypto.randomUUID()) {
  const now = new Date().toISOString();
  return { id, dataset, createdAt: now, updatedAt: now };
}
export const defaultProfile = (id = "personal"): Profile => ({
  id,
  name: "Athlete",
  sport: "Fencing",
  timezone:
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Singapore",
  goals: "Develop strength and compete consistently",
  preferredDays: [1, 2, 4, 5, 6],
  unavailableDates: [],
  frequency: 5,
  strengthPriority: "Lower-body strength and power",
  conditioningPriority: "Repeat-effort capacity",
  checkInReminder: true,
  mentalTracking: true,
  windows: { A: 7, B: 3, C: 0 },
  adjustMinutes: 15,
  postCompetitionDays: 2,
  defaultRpeMode: "quick",
  theme: "light",
});
