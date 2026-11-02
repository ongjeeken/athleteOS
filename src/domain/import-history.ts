import ICAL from "ical.js";
import Papa from "papaparse";
import { Temporal } from "@js-temporal/polyfill";
import { addDays, today } from "./dates";
import {
  categories,
  dateSchema,
  identity,
  type Dataset,
  type HistoricalRecord,
} from "./models";
import { guessActivity, type Candidate, type ImportResult } from "./history";
export type ImportOptions = {
  dataset: Dataset;
  athleteTimezone: string;
  sourceTimezone: string;
  from: string;
  to: string;
  dateOrder: "auto" | "DMY" | "MDY";
  durationUnit: "auto" | "minutes" | "hours" | "seconds";
  allowUnknownTimezone?: boolean;
};
export const csvFields = [
  "title",
  "date",
  "time",
  "end",
  "duration",
  "category",
  "customActivity",
  "rpe",
  "timezone",
  "notes",
  "durationQuality",
] as const;
export type CsvMapping = Record<(typeof csvFields)[number], string>;
export type CsvTable = {
  headers: string[];
  rows: Record<string, string>[];
  mapping: CsvMapping;
};
const aliases: Record<(typeof csvFields)[number], string[]> = {
  title: [
    "title",
    "subject",
    "summary",
    "name",
    "activity",
    "workout",
    "event",
  ],
  date: ["date", "start", "startdate", "starttime", "dtstart", "activitydate"],
  time: ["time", "timeofday"],
  end: ["end", "enddate", "endtime", "dtend"],
  duration: [
    "durationminutes",
    "actualdurationmin",
    "durationmin",
    "duration",
    "minutes",
    "durationseconds",
    "durationhours",
    "elapsedtime",
    "movingtime",
  ],
  category: ["category", "type", "sport", "activitytype", "sessiontype"],
  customActivity: ["customactivity", "customcategory"],
  rpe: ["rpe", "sessionrpe", "ratingofperceivedexertion"],
  timezone: ["timezone", "tz", "tzid"],
  notes: ["notes", "description", "comments"],
  durationQuality: [
    "durationquality",
    "durationestimated",
    "estimatedduration",
    "dataquality",
  ],
};
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function parseCsvTable(text: string): CsvTable {
  if (!text.trim()) throw new Error("The CSV file is empty.");
  const parsed = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    },
  );
  const fatal = parsed.errors.filter((e) => e.code !== "TooFewFields");
  if (fatal.length)
    throw new Error(`CSV could not be read: ${fatal[0].message}`);
  const headers = parsed.meta.fields ?? [];
  if (headers.length < 2)
    throw new Error(
      "CSV needs a header row and at least a title and date column.",
    );
  if (parsed.data.length > 5000)
    throw new Error(
      "This file has more than 5,000 rows. Split it into smaller files.",
    );
  const mapping = Object.fromEntries(
    csvFields.map((field) => [
      field,
      headers.find((h) => aliases[field].includes(normalize(h))) ?? "",
    ]),
  ) as CsvMapping;
  return { headers, rows: parsed.data, mapping };
}
function pad(n: number, length = 2) {
  return String(n).padStart(length, "0");
}
function validZone(zone: string) {
  try {
    Temporal.Now.zonedDateTimeISO(zone);
    return true;
  } catch {
    return false;
  }
}
function parseDateText(raw: string, order: ImportOptions["dateOrder"]) {
  let v = raw.trim();
  const slash = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(.*)$/);
  if (slash) {
    let a = Number(slash[1]),
      b = Number(slash[2]);
    if (order === "auto" && a <= 12 && b <= 12)
      throw new Error(
        "Ambiguous day/month order; choose Day/month or Month/day.",
      );
    const dmy = order === "DMY" || (order === "auto" && a > 12);
    v = `${slash[3]}-${pad(dmy ? b : a)}-${pad(dmy ? a : b)}${slash[4]}`;
  }
  if (/^\d{8}$/.test(v))
    v = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
}
function parseMoment(
  raw: string,
  zone: string,
  options: ImportOptions,
  time = "",
): {
  date: string;
  time: string;
  instant?: Temporal.Instant;
  estimatedTime: boolean;
} {
  const v = parseDateText(raw, options.dateOrder);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !time) {
    dateSchema.parse(v);
    return { date: v, time: "", estimatedTime: true };
  }
  let dt = v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && time) dt = v + "T" + time.trim();
  const instant = /(Z|[+-]\d{2}:?\d{2})$/i.test(dt)
    ? Temporal.Instant.from(dt)
    : Temporal.PlainDateTime.from(dt)
        .toZonedDateTime(zone, { disambiguation: "reject" })
        .toInstant();
  const local = instant.toZonedDateTimeISO(options.athleteTimezone);
  return {
    date: local.toPlainDate().toString(),
    time: `${pad(local.hour)}:${pad(local.minute)}`,
    instant,
    estimatedTime: false,
  };
}
function durationValue(
  value: string,
  header: string,
  unit: ImportOptions["durationUnit"],
): number | null {
  if (!value.trim()) return null;
  let n: number;
  if (/^\d+:\d{2}(:\d{2}(\.\d+)?)?$/.test(value.trim())) {
    const parts = value.trim().split(":").map(Number);
    n = parts[0] * 60 + parts[1] + (parts[2] ?? 0) / 60;
  } else {
    n = Number(value.replace(",", "."));
    const effective =
      unit === "auto"
        ? /second/i.test(header)
          ? "seconds"
          : /hour/i.test(header)
            ? "hours"
            : "minutes"
        : unit;
    if (effective === "seconds") n /= 60;
    if (effective === "hours") n *= 60;
  }
  if (!Number.isFinite(n) || n <= 0 || n > 720)
    throw new Error(
      "Duration must be between 0 and 720 minutes; check the duration unit.",
    );
  return Math.round(n * 100) / 100;
}
export function csvCandidates(
  table: CsvTable,
  mapping: CsvMapping,
  options: ImportOptions,
  sourceName: string,
): ImportResult {
  if (!mapping.title || !mapping.date)
    throw new Error("Map a title and start date column before previewing.");
  if (!validZone(options.sourceTimezone) || !validZone(options.athleteTimezone))
    throw new Error("Enter a valid IANA timezone.");
  const batchId = crypto.randomUUID(),
    records: Candidate[] = [],
    warnings: string[] = [];
  table.rows.forEach((row, index) => {
    try {
      const get = (k: (typeof csvFields)[number]) =>
          (row[mapping[k]] ?? "").trim(),
        title = get("title");
      if (!title) throw new Error("Missing title.");
      if (title.length > 150)
        throw new Error("Title is longer than 150 characters.");
      const sourceTimezone = get("timezone") || options.sourceTimezone;
      if (!validZone(sourceTimezone))
        throw new Error(`Unknown timezone: ${sourceTimezone}.`);
      const start = parseMoment(
        get("date"),
        sourceTimezone,
        options,
        get("time"),
      );
      if (start.date < options.from || start.date > options.to) return;
      const hints: string[] = [];
      const estimatedFields: HistoricalRecord["estimatedFields"] =
        start.estimatedTime ? ["time"] : [];
      let duration = durationValue(
        get("duration"),
        mapping.duration,
        options.durationUnit,
      );
      if (duration === null && get("end")) {
        const end = parseMoment(get("end"), sourceTimezone, options);
        if (start.instant && end.instant) {
          duration =
            Number(
              end.instant.epochMilliseconds - start.instant.epochMilliseconds,
            ) / 60000;
          estimatedFields.push("durationMinutes");
        }
      }
      if (duration !== null && (duration <= 0 || duration > 720))
        throw new Error(
          "Calendar duration is outside 0–720 min; enter active exercise time manually.",
        );
      const guess = guessActivity(title + " " + get("category"));
      const category =
        categories.find((c) => normalize(c) === normalize(get("category"))) ||
        guess.category;
      let rpe: number | null = null;
      if (get("rpe")) {
        const parsed = Number(get("rpe"));
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10)
          rpe = parsed;
        else hints.push("Invalid RPE was left unknown.");
      }
      if (
        /estimate|true|yes|^1$/i.test(get("durationQuality")) &&
        !estimatedFields.includes("durationMinutes")
      )
        estimatedFields.push("durationMinutes");
      if (start.estimatedTime) hints.push("Time was not provided.");
      records.push({
        ...identity(options.dataset),
        batchId,
        source: "csv",
        sourceName,
        sourceKey: `csv:${start.date}:${start.time}:${normalize(title)}`,
        sourceTimezone,
        date: start.date,
        endDate: start.date,
        time: start.time,
        title,
        category,
        customActivity: get("customActivity").trim().slice(0, 80) || undefined,
        kind: guess.kind,
        priority: "C",
        durationMinutes: duration,
        rpe,
        rpeInputMode: rpe === null ? "quick" : "detailed",
        estimatedFields,
        status: "unconfirmed",
        notes: get("notes"),
        included: guess.likelyTraining,
        warnings: hints,
      });
    } catch (e) {
      warnings.push(
        `Row ${index + 2}: ${e instanceof Error ? e.message : "Invalid data."}`,
      );
    }
  });
  return { records, warnings };
}
export function icsCandidates(
  text: string,
  options: ImportOptions,
  sourceName: string,
): ImportResult {
  if (!validZone(options.sourceTimezone) || !validZone(options.athleteTimezone))
    throw new Error("Enter a valid IANA timezone.");
  let calendar: InstanceType<typeof ICAL.Component>;
  try {
    calendar = new ICAL.Component(ICAL.parse(text));
    if (calendar.name !== "vcalendar") throw new Error();
  } catch {
    throw new Error(
      "This is not a valid ICS calendar. Select a file with BEGIN:VCALENDAR and VEVENT entries.",
    );
  }
  const previousZones = new Map<
    string,
    InstanceType<typeof ICAL.Timezone> | undefined
  >();
  for (const component of calendar.getAllSubcomponents("vtimezone")) {
    const id = String(component.getFirstPropertyValue("tzid"));
    previousZones.set(
      id,
      ICAL.TimezoneService.has(id) ? ICAL.TimezoneService.get(id) : undefined,
    );
    ICAL.TimezoneService.register(component);
  }
  const records: Candidate[] = [],
    warnings: string[] = [],
    batchId = crypto.randomUUID();
  let iterations = 0;
  function local(
    time: InstanceType<typeof ICAL.Time>,
    item: InstanceType<typeof ICAL.Event>,
    property = "dtstart",
  ) {
    if (time.isDate)
      return {
        date: time.toString(),
        time: "",
        instant: undefined,
        assumedTimezone: false,
      };
    const tzid = String(
      item.component.getFirstProperty(property)?.getParameter("tzid") ??
        item.component.getFirstProperty("dtstart")?.getParameter("tzid") ??
        "",
    );
    let instant: Temporal.Instant;
    let assumedTimezone = false;
    if (
      time.zone === ICAL.Timezone.utcTimezone ||
      (time.zone.tzid !== "floating" &&
        time.zone.tzid !== "local" &&
        ICAL.TimezoneService.has(time.zone.tzid))
    )
      instant = Temporal.Instant.fromEpochMilliseconds(
        time.toUnixTime() * 1000,
      );
    else {
      let zone = tzid || options.sourceTimezone;
      if (!validZone(zone)) {
        if (!options.allowUnknownTimezone)
          throw new Error(
            `Unsupported TZID “${zone}”; choose the fallback timezone option or fix the source file.`,
          );
        warnings.push(
          `Unsupported TZID “${zone}” interpreted using ${options.sourceTimezone}.`,
        );
        zone = options.sourceTimezone;
        assumedTimezone = true;
      }
      instant = Temporal.PlainDateTime.from(
        `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`,
      )
        .toZonedDateTime(zone, { disambiguation: "reject" })
        .toInstant();
    }
    const athlete = instant.toZonedDateTimeISO(options.athleteTimezone);
    return {
      date: athlete.toPlainDate().toString(),
      time: `${pad(athlete.hour)}:${pad(athlete.minute)}`,
      instant,
      assumedTimezone,
    };
  }
  try {
    const components = calendar.getAllSubcomponents("vevent");
    if (components.length > 5000)
      throw new Error("More than 5,000 calendar events; split this file.");
    const masterIds = new Set(
      components
        .filter((c) => !c.hasProperty("recurrence-id"))
        .map((c) => String(c.getFirstPropertyValue("uid"))),
    );
    for (const component of components) {
      if (
        component.hasProperty("recurrence-id") &&
        masterIds.has(String(component.getFirstPropertyValue("uid")))
      )
        continue;
      const title = String(
        component.getFirstPropertyValue("summary") ?? "Untitled event",
      ).slice(0, 150);
      if (
        String(component.getFirstPropertyValue("status")).toUpperCase() ===
        "CANCELLED"
      )
        continue;
      if (!component.hasProperty("dtstart")) {
        warnings.push(`${title}: no start date; skipped.`);
        continue;
      }
      const rules = component.getAllProperties("rrule");
      if (
        rules.some((r) =>
          /FREQ=(SECONDLY|MINUTELY|HOURLY)/.test(r.toICALString()),
        )
      ) {
        warnings.push(
          `${title}: sub-daily recurrence is not suitable for training import; skipped.`,
        );
        continue;
      }
      try {
        const event = new ICAL.Event(component),
          recurring = event.isRecurring(),
          iterator = event.iterator();
        let occurrence: InstanceType<typeof ICAL.Time> | null = recurring
          ? iterator.next()
          : event.startDate;
        while (occurrence) {
          if (++iterations > 50000)
            throw new Error(
              "Recurrence expansion reached the 50,000-occurrence safety limit. Split or shorten this calendar.",
            );
          const cancelled = components.some(
            (c) =>
              String(c.getFirstPropertyValue("uid")) === event.uid &&
              c.hasProperty("recurrence-id") &&
              String(c.getFirstPropertyValue("status")).toUpperCase() ===
                "CANCELLED" &&
              String(c.getFirstPropertyValue("recurrence-id")) ===
                occurrence!.toString(),
          );
          if (cancelled) {
            if (
              recurring &&
              local(occurrence, event).date > addDays(options.to, 2)
            )
              break;
            occurrence = recurring ? iterator.next() : null;
            continue;
          }
          const details = recurring
            ? event.getOccurrenceDetails(occurrence)
            : {
                item: event,
                startDate: event.startDate,
                endDate: event.endDate,
              };
          const item = details.item;
          if (
            String(
              item.component.getFirstPropertyValue("status"),
            ).toUpperCase() !== "CANCELLED"
          ) {
            const start = local(details.startDate, item),
              end = local(details.endDate, item, "dtend");
            if (start.date >= options.from && start.date <= options.to) {
              const label = item.summary || title,
                guess = guessActivity(label),
                allDay = details.startDate.isDate;
              let duration: number | null = allDay
                ? null
                : start.instant && end.instant
                  ? Number(
                      end.instant.epochMilliseconds -
                        start.instant.epochMilliseconds,
                    ) / 60000
                  : null;
              const hints = [
                "Calendar attendance and active exercise time are unverified.",
              ];
              if (duration !== null && (duration <= 0 || duration > 720)) {
                duration = null;
                hints.push(
                  "Enter active exercise duration before confirming this session.",
                );
              }
              const endDate =
                allDay && end.date > start.date
                  ? addDays(end.date, -1)
                  : end.date;
              records.push({
                ...identity(options.dataset),
                batchId,
                source: "ics",
                sourceName,
                sourceKey: `ics:${event.uid || normalize(title)}:${occurrence.toString()}`,
                sourceTimezone: start.assumedTimezone
                  ? options.sourceTimezone
                  : String(
                      item.component
                        .getFirstProperty("dtstart")
                        ?.getParameter("tzid") ??
                        (details.startDate.zone === ICAL.Timezone.utcTimezone
                          ? "UTC"
                          : options.sourceTimezone),
                    ),
                date: start.date,
                endDate: endDate >= start.date ? endDate : start.date,
                time: start.time,
                title: label.slice(0, 150),
                category: guess.category,
                kind: guess.kind,
                priority: "C",
                durationMinutes:
                  duration === null ? null : Math.round(duration * 100) / 100,
                rpe: null,
                estimatedFields: allDay
                  ? ["time"]
                  : [
                      "durationMinutes",
                      ...(start.assumedTimezone ? ["time" as const] : []),
                    ],
                status: "unconfirmed",
                notes: (
                  String(
                    item.component.getFirstPropertyValue("description") ?? "",
                  ) +
                  (start.assumedTimezone
                    ? ` [Timezone assumed: ${options.sourceTimezone}; source TZID: ${item.component.getFirstProperty("dtstart")?.getParameter("tzid")}.]`
                    : "")
                ).slice(0, 5000),
                included: guess.likelyTraining,
                warnings: hints,
              });
              if (records.length >= 2000)
                throw new Error(
                  "More than 2,000 occurrences in this window. Narrow the date range.",
                );
            }
            // Compare the recurrence identifier, not a moved exception, to stop expanding.
            if (
              recurring &&
              local(occurrence, event).date > addDays(options.to, 2)
            )
              break;
          }
          if (
            recurring &&
            local(occurrence, event).date > addDays(options.to, 2)
          )
            break;
          occurrence = recurring ? iterator.next() : null;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid event";
        if (/safety limit|2,000/.test(message)) throw e;
        warnings.push(`${title}: ${message}`);
      }
    }
  } finally {
    for (const [id, previous] of previousZones) {
      if (previous) ICAL.TimezoneService.register(previous, id);
      else ICAL.TimezoneService.remove(id);
    }
  }
  return { records, warnings: [...new Set(warnings)] };
}
export function defaultImportOptions(
  dataset: Dataset,
  timezone: string,
  date = today(timezone),
): ImportOptions {
  return {
    dataset,
    athleteTimezone: timezone,
    sourceTimezone: timezone,
    from: addDays(date, -42),
    to: addDays(date, -1),
    dateOrder: "auto",
    durationUnit: "auto",
  };
}
