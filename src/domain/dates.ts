export function today(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  now = new Date(),
): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
}
export const addDays = (d: string, n: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000,
  );
export const weekday = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
export const weekStart = (d: string) => addDays(d, -((weekday(d) + 6) % 7));
export const dateRange = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => addDays(start, i));
export const fmt = (
  d: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(d + "T12:00:00Z"),
  );
