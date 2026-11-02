export const kinds = [
  "fencing",
  "strength",
  "conditioning",
  "recovery",
  "other",
] as const;
export type Kind = (typeof kinds)[number];
export const labels: Record<Kind, string> = {
  fencing: "Fencing",
  strength: "Gym / strength",
  conditioning: "Conditioning",
  recovery: "Recovery / mobility",
  other: "Other",
};
export const shortLabels: Record<Kind, string> = {
  ...labels,
  strength: "Gym",
  recovery: "Recovery",
};
export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const intensities = ["Light", "Moderate", "Hard"] as const;
export type Intensity = (typeof intensities)[number];
export type Effort = Intensity;
export type StoredEffort = Effort | "Easy" | "Normal";
/** Compatibility labels only. Historical values remain unchanged in storage. */
export const effortIntensity = (value?: StoredEffort): Intensity | undefined =>
  value === "Easy" ? "Light" : value === "Normal" ? "Moderate" : value;
export type CompetitionPriority = "regular" | "priority";
export type Recommendation = {
  level: Intensity;
  reason: string;
  focus: string;
  rule: string;
  generatedOn: string;
  engineVersion: 1;
};
export type Template = { id: string; day: number; kind: Kind };
export type Session = {
  id: string;
  templateId?: string;
  originalDate: string;
  date: string;
  kind: Kind;
  status: "planned" | "completed" | "skipped";
  effort?: StoredEffort;
  /** Legacy data only: never displayed, requested or used in calculations. */
  duration?: number;
  notes?: string;
  modified: boolean;
  removed?: boolean;
  recommendation?: Recommendation;
  intensityOverride?: Intensity;
};
export type Competition = {
  date: string;
  name: string;
  priority?: CompetitionPriority;
};
export type TrackerData = {
  version: 1;
  startedOn: string;
  templates: Template[];
  sessions: Session[];
  competition?: Competition;
  competitionHistory?: Competition[];
};
export const uid = () => crypto.randomUUID();
