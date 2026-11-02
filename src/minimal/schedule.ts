import { addDays, dateRange, weekStart, weekday } from "../domain/dates";
import type { Session, Template, TrackerData } from "./model";

/** Civil dates stay YYYY-MM-DD. UTC is used only for calendar arithmetic. */
export function materialize(
  data: TrackerData,
  start: string,
  end = addDays(start, 6),
): TrackerData {
  const known = new Set(data.sessions.map((s) => s.id));
  const additions: Session[] = [];
  for (
    let date = start < data.startedOn ? data.startedOn : start;
    date <= end;
    date = addDays(date, 1)
  ) {
    for (const template of data.templates) {
      if (template.day !== (weekday(date) + 6) % 7) continue;
      const id = `${template.id}@${date}`;
      if (!known.has(id)) {
        additions.push({
          id,
          templateId: template.id,
          originalDate: date,
          date,
          kind: template.kind,
          status: "planned",
          modified: false,
        });
        known.add(id);
      }
    }
  }
  return additions.length
    ? { ...data, sessions: [...data.sessions, ...additions] }
    : data;
}

export function sessionsOn(data: TrackerData, date: string) {
  return data.sessions.filter((s) => s.date === date && !s.removed);
}
export function sessionsInWeek(data: TrackerData, start: string) {
  return data.sessions.filter(
    (s) => !s.removed && s.date >= start && s.date <= addDays(start, 6),
  );
}

/** Freeze elapsed dates, then update only unmodified future template occurrences. */
export function changeRoutine(
  data: TrackerData,
  templates: Template[],
  today: string,
): TrackerData {
  const frozen = materialize(data, data.startedOn, addDays(today, -1));
  const retained = frozen.sessions.filter(
    (s) =>
      !s.templateId ||
      s.originalDate < today ||
      s.modified ||
      s.status !== "planned",
  );
  let next: TrackerData = { ...frozen, templates, sessions: retained };
  // Regenerate weeks already visited, keeping every individually changed occurrence.
  const dates = [
    addDays(weekStart(today), 6),
    ...data.sessions.map((s) => s.originalDate),
  ];
  const end = dates.reduce((a, b) => (a > b ? a : b));
  next = materialize(next, today, end);
  return next;
}

export function openWeek(
  data: TrackerData,
  date: string,
  today: string,
): TrackerData {
  // Capture unvisited past weeks before a later routine edit can change them.
  const frozen = materialize(data, data.startedOn, today);
  return materialize(frozen, weekStart(date));
}

export const weekDays = (date: string) => dateRange(weekStart(date), 7);
