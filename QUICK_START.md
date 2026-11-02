# Quick Start: implementation and data contract

Quick Start extends the existing AthleteOS application. Its target is approximately 2–3 minutes for a straightforward schedule; that is a design target, not a measured usability claim.

## First-use flow

1. **Competition Schedule.** Enter zero, one or multiple tournaments, including multi-day events and A/B/C priority. Names are optional. “No upcoming competitions” is prominent. The athlete name and timezone are optional context, with the device timezone as the initial setting.
2. **Typical Training Week.** Use the shared activity-by-day selector. Tap days for each activity; durations, exact times and subtypes are optional. Multiple activities and additional same-type sessions stay independent. The detailed calendar remains an advanced option. Rest and unavailable days are protected. The entire step can be skipped. The CSV/ICS pathway is secondary and continues through goal selection before opening the importer.
3. **Training Objective.** Choose a primary objective; secondary goals and a current-context note are optional. Default is balanced development. No historical log, RPE, recovery questionnaire, wearable or account is required.

A local IndexedDB draft autosaves changes and step navigation. Back, Continue and refresh retain entered data. Finalization is transactional. No completed workouts or wellness observations are created. The draft is removed after the profile, competition commitments and provisional future sessions have been saved.

## Immediate value

The existing dashboard gains a provisional 14-day calendar, next competition, objective, typical weekly hours, planned frequency and activity distribution. Calendar dates open the existing calendar for editing. Existing Log Session and Check In actions remain available. No competition means general training development. No supplied week means no invented workouts.

The existing deterministic planner evaluates competition dates, priority, schedule conflicts, rest, availability and goals. Sparse history or an absent personal recovery baseline keeps guidance labeled Provisional. An onboarding context flag is distinct from a measured recovery entry and is considered for 14 calendar days, with no readiness or injury prediction. Actual training and recovery observations continue to drive the existing calculations as they become available.

Existing athletes can reach **Settings → My Usual Training Week** and **Add or review historical training**. Saving the usual routine updates its reusable template without changing existing planned or completed sessions. Date-range application is a separate previewed operation. See ACTIVITY_SETUP.md.

## Optional historical paths

### Reconstruct My Recent Training — recommended

The usual week can propose the previous 2, 4 or 6 weeks, ending yesterday. Every proposed occurrence begins **unconfirmed**, with `rpe: null` and estimated duration metadata. Template times may be unspecified.

The calendar-based review supports per-day and date-range review, completed/missed/unconfirmed status, category and duration edits, exclusions, and exceptional workouts or tournaments. Range actions show a count/date/estimate summary before applying to proposals. Nothing enters completed training until **Save reviewed history** is explicitly used. Uncertain and missed records are saved separately and can be reviewed later.

Remembered effort is optional and uses the existing Quick RPE choices, with Detailed Mode available inline. No effort is inferred from category, duration, template or calendar text. Temporary mode choices do not change the profile preference.

### Local CSV / ICS import

Files can be selected or dropped into the importer. Parsing occurs on the device using Papa Parse, ICAL.js and Temporal; there is no upload endpoint or cloud account. Select a historical date range, source timezone, and (for CSV) date order and duration units. Recognized CSV headers are mapped automatically and all mappings can be corrected. Title and start-date columns are required; duration, RPE, exact time and other columns are optional.

CSV accepts ISO dates/timestamps and numeric day/month/year formats with an explicit choice when ambiguous. Offset timestamps are converted to the athlete timezone. Duration seconds/hours and HH:MM[:SS] exports are supported. A recognized duration-quality column preserves estimated durations when re-importing an AthleteOS CSV. Invalid RPE is left null with a warning; deliberate zero remains zero. A file’s “completed” label does not confirm attendance.

ICS supports typical RRULE recurrences, RDATE, EXDATE, moved recurrence exceptions, cancelled events and custom embedded VTIMEZONE definitions. UTC, IANA timezones, and floating times interpreted in the selected source timezone are supported. DST conversion uses the timezone of each occurrence, not the first occurrence’s offset. Unsupported TZIDs are warned/skipped unless the athlete explicitly enables fallback; assumed timezone values are marked and recorded. Calendar elapsed time is an estimated exercise duration pending athlete review. All-day tournament end dates are converted from ICS’s exclusive end to an inclusive competition date; no active exercise duration is inferred.

Likely training/tournament entries are initially included for review; unrelated entries are initially excluded and can be included/classified manually. All entries still start unconfirmed. Duplicate detection compares source identifiers and likely date/title/time/duration matches against existing data and within the batch. Likely duplicates are excluded by default; the database rechecks inside the save transaction to prevent stale previews from double-importing. Imports append reviewed records and never replace the dataset. The existing JSON backup restore remains a separate, explicitly confirmed replacement workflow.

## Provenance and calculation rules

- `PlannedSession`: future intended work, with a weekly-template origin and provisional flag where generated. It never contributes to actual workload.
- `HistoricalRecord`: staging/audit record for reconstructed/imported/manual proposals. Status is unconfirmed, missed or explicitly confirmed completed. This is not a second actual-workout table. Source name/key/timezone, batch, field-level estimate flags and associations are retained.
- `CompletedSession`: the existing canonical actual-workout entity. Only explicit confirmation creates it. Its provenance includes the source, originating history record, estimate flags and confirmation timestamp.
- `Tournament`: an independent calendar commitment. Confirming an imported tournament creates the calendar event, not a completed Competition workout. Active competition exercise is logged separately if known.

Completed attendance counts toward frequency even with missing RPE. Duration analytics distinguish directly reported minutes and athlete-confirmed estimated minutes. Unconfirmed and missed history contribute to neither actual frequency nor actual workload. `sessionLoad = durationMinutes × rpe` remains unchanged, or null when RPE is missing. The stored value may describe an estimate, but precise workload totals and individualized planning eligibility exclude sessions whose duration or RPE is estimated. Estimates are disclosed separately; unknown values never become an implicit zero.

Direct session editing retains provenance and lets the athlete correct the duration-estimate flag. Deleting a linked completed session returns its historical record to unconfirmed so backup relationships remain valid. JSON backups preserve provenance, history and weekly templates. Training CSV includes source, confirmation and duration-quality columns.

## Migration and resilience

IndexedDB schema 2 added history and setup-draft tables; schema 3 additionally adds templates, recurrences and occurrence exceptions. Schema 4 additionally supports unknown durations and custom activity labels; schema 1/2/3 records remain intact. New model fields are optional for existing profiles and sessions. Existing athletes are not forced through onboarding. JSON backup schema 4 includes historical records and recurrence metadata; valid schema 1/2/3 backups migrate safely. Unknown versions and invalid relationships fail before replacement. Dataset namespaces preserve personal/sample isolation, including history associations.

Import limits: 8 MB per file, 5,000 CSV rows or ICS event components, 2,000 expanded ICS occurrences per preview and a 50,000-occurrence iteration ceiling. Sub-daily recurrence is skipped with a warning. Some unusual provider exports or old, very frequent recurring series may need a smaller file or preprocessing. CSV date phrases and locale-specific textual month formats are not guessed. No sync, OAuth or continuing subscription to an ICS URL is implemented.

Weekly templates create the initial next 14 days, and can be edited/reapplied from Settings. The shared training editor can also apply custom date ranges or explicit recurrence, including ongoing schedules expanded locally on later app use. There is no background service or prescribed intensity. See TRAINING_PLANNER.md. Full browser automation currently covers Chromium desktop/mobile; Safari/Firefox compatibility and measured 2–3 minute usability remain future validation work.
