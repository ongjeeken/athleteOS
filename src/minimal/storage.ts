import { z } from "zod";
import { intensities, kinds, type TrackerData } from "./model";
export const STORAGE_KEY = "athleteos-minimal-v1";
export const DRAFT_KEY = "athleteos-minimal-setup-v1";
const date = z.iso.date();
const template = z.object({
  id: z.string().min(1),
  day: z.number().int().min(0).max(6),
  kind: z.enum(kinds),
});
const priority = z.enum(["regular", "priority"]);
const competition = z.object({
  date,
  name: z.string().max(120),
  priority: priority.optional(),
});
const schema = z
  .object({
    version: z.literal(1),
    startedOn: date,
    templates: z.array(template),
    sessions: z.array(
      z.object({
        id: z.string().min(1),
        templateId: z.string().optional(),
        originalDate: date,
        date,
        kind: z.enum(kinds),
        status: z.enum(["planned", "completed", "skipped"]),
        effort: z.enum([...intensities, "Easy", "Normal"]).optional(),
        duration: z.number().int().min(1).max(1440).optional(),
        notes: z.string().max(2000).optional(),
        modified: z.boolean(),
        removed: z.boolean().optional(),
        intensityOverride: z.enum(intensities).optional(),
        recommendation: z
          .object({
            level: z.enum(intensities),
            reason: z.string(),
            focus: z.string(),
            rule: z.string(),
            generatedOn: date,
            engineVersion: z.literal(1),
          })
          .optional(),
      }),
    ),
    competition: competition.optional(),
    competitionHistory: z.array(competition).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.sessions.map((s) => s.id)).size !== value.sessions.length ||
      new Set(value.templates.map((t) => t.id)).size !== value.templates.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate record identifiers" });
    if (value.sessions.some((s) => s.status === "completed" && !s.effort))
      ctx.addIssue({
        code: "custom",
        message: "A completed session needs an effort rating",
      });
  });
export function readData(): TrackerData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const result = schema.safeParse(JSON.parse(raw));
  if (!result.success)
    throw new Error(
      "Saved training could not be read. Your existing data is still in this browser.",
    );
  return result.data;
}
export function saveData(data: TrackerData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schema.parse(data)));
}
export type SetupDraft = {
  step: 1 | 2;
  templates: TrackerData["templates"];
  name: string;
  date: string;
  priority?: "regular" | "priority";
};
export function readDraft(): SetupDraft {
  const fallback: SetupDraft = { step: 1, templates: [], name: "", date: "" };
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return fallback;
  try {
    const value = z
      .object({
        step: z.union([z.literal(1), z.literal(2)]),
        templates: z.array(template),
        name: z.string().max(120),
        date: z.string(),
        priority: priority.optional(),
      })
      .parse(JSON.parse(raw));
    return value;
  } catch {
    return fallback;
  }
}
