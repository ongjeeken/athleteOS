# Fast training entry and history-based planning

Open **Calendar → Plan Training** for the shared activity-by-day selector. See ACTIVITY_SETUP.md for the default flow, optional durations and editing scopes. The same editor is available through the history-planning action on Insights and the optional Today invitation. All processing and storage remain local.

## A week with multiple sessions

Every session/rule has a stable independent ID. There is no date-based upsert. Tap activity/day cells and set a typical duration once per activity if known. Add another same-type session through the secondary control. Leave exact times and durations blank when unknown. The advanced editor retains independent session cards, inline edits, duplication, moving and copying. Multi-select supports duplication, moving, duration editing and removal. The editor has an undo action for the last rule edit.

The reusable week supplies the historical and future paths. The original onboarding editor and optional CSV/ICS importer remain available. Basic routine entry needs activity and day; duration is optional. Session names, subtype, time, effort and advanced details remain optional.

## Reconstruct Past Training

Choose a typical or saved week, or paste one. Select the previous 2/4/6 weeks or a custom past range. Preview independent occurrences in the existing history-review calendar. Confirm a date range or selected sessions, mark missed, remove proposals, change activity/duration, add exceptions or leave uncertain. A visible bulk summary appears before changing completion status.

All proposals begin unconfirmed, with `rpe: null`. Generated durations remain estimates unless the athlete explicitly corrects their quality. Quick and Detailed RPE are available voluntarily. Save creates canonical completed sessions only for explicitly confirmed workouts; uncertain/missed history stays separate. Tournament commitments never become completed competition exercise automatically.

## Use My Training History to Plan Ahead

1. Choose the last completed week, the last 2/4/6 complete calendar weeks (4 is the default), or a custom historical range.
2. Detect patterns from the canonical completed-session table. Scheduled, missed and unverified entries are excluded.
3. Review included patterns and excluded sessions with reasons. Adjust the thresholds, choose irregular patterns explicitly or fall back to the existing typical week.
4. Edit the suggested week, save it as a named template if useful, then preview its future occurrences.
5. Save one-time plans or a recurring series for 2/4/8/12 weeks, custom dates or an ongoing schedule.

### Deterministic heuristics

- Group by weekday, activity category, recorded time band and independent ordinal slot within each day. Two sessions of the same activity/day/band remain separate. Untimed sessions use duration/order to align comparable slots; those alignments are heuristic and editable.
- Normally require at least two observations and presence in at least half the selected weekday opportunities. Both thresholds are configurable. A deliberate last-week copy does not claim recurrence.
- Suggested duration is the rounded median of comparable completed sessions. Where there are at least three observations, durations above 1.75× their median are excluded as unusually long; the multiplier is configurable.
- Competition sessions and titles/foci marked as camps, one-off or exceptional are excluded for review. The athlete can explicitly include them if weekly repetition is intended.
- Athlete-confirmed estimated durations are excluded by default. An optional control includes them with clear labeling. Missing RPE stays null and is never used to infer future intensity.
- Empty weekdays are described as having no recorded completed training. Missing logs do not establish permanent rest days. Irregular patterns remain unchecked; the app never silently invents a routine.

History-derived templates retain source session IDs and analyzed dates. These are optional provenance references; deleting an old actual session does not delete its saved template. Future durations are planned values, never physiological observations. A past routine is not claimed to be optimal.

## Future recurrence and review

Recurring definitions are separate from generated planned occurrences and actual completed sessions. Each occurrence carries its series ID, rule ID and original occurrence date. A one-time week copy creates no recurring definition.

Preview shows new sessions, existing records, potential duplicates, tournament/preparation conflicts and protected availability. Duplicate matching is one-for-one so an existing untimed session does not swallow a second intentional session on the same date. Linked planned/completed versions are one logical workout for duplicate detection. Existing records are preserved; likely duplicates start excluded and are rechecked transactionally at save.

Individual calendar edits create an exception. Skip/delete on an uncompleted recurring occurrence records a skip. Edit a recurring series from the editor, choose this date and future occurrences or the entire series, and review before saving. Completed training, past occurrences, locked sessions and explicit individual changes are protected. Ending a schedule removes only eligible future occurrences. Undo of a newly saved schedule removes unchanged, unlocked planned additions and stops its recurrence, retaining any actual training and individual edits.

An ongoing series stores `endDate: null`. It initially materializes 12 weeks and extends locally to a rolling 12-week horizon when the athlete opens/uses the app on a later day. It is not a background service; a closed app performs no work. Finite custom applications are limited to two years per operation.

### Competition-aware suggestions

The proposed calendar is passed through the existing deterministic periodization engine with tournament priority, completed workload, recovery, goals and availability. Preview suggestions can be accepted into the proposed occurrences, kept unchanged or edited by returning to the weekly editor. Existing records are never adjusted as a side effect of previewing a new schedule. Accepted preview adjustments become protected individual occurrence edits. Saved plans continue to participate in the existing audited recommendation workflow. No automatic taper, intensity inference or readiness score is introduced.

## Paste Training Schedule

The secondary offline parser accepts weekday or ISO-date lines, comma/semicolon-separated sessions, whole-minute or hour durations, AM/morning, afternoon, PM/evening and optional 24-hour times. Example:

```text
Mon: Gym 60m AM, Fencing 120m PM
Wed: Conditioning 30m AM, Fencing 90m PM
Sat: Footwork 45m, Sparring 120m
```

PM is interpreted as Evening; use “afternoon” for that band. Unknown activities are labeled Other with a warning. Missing durations, unrecognized lines and invalid dates are flagged. Parsed sessions have an editable weekly preview. Dated one-time sessions retain their dates; moving them changes the weekday within the same original week. Mixed dated/weekday inputs require correction before a one-time application. Creating recurrence from dated input explicitly reuses their weekday positions.

Named templates can be saved, renamed, duplicated, edited, deleted and reused without rerunning detection. Competition, recovery, high-volume and strength-focused names are available as empty custom starting points; the app does not invent volumes for them.

## Schema and compatibility

IndexedDB schema 3 adds `templates`, `recurrences` and `recurrenceExceptions`, and a `seriesId` index on plans. Schema 4 additionally supports nullable routine/plan duration and custom activity labels. Schemas 1, 2 and 3 upgrade in place without rewriting actual workouts. Optional fields preserve compatibility with earlier sessions/plans: `timeOfDay`, series metadata, occurrence-edit flag and planning batch ID. Bulk writes and recurrence changes are transactional. Completing a plan retains its existing planned-session relationship, actual duration and optional numerical RPE. Analytics consume completed sessions once; planned targets never contribute to actual workload.

JSON backup schema 4 includes the new tables and preserves relationships when changing sample/personal namespaces. Legacy schema 1/2/3 backups migrate to empty template/recurrence collections. Existing CSV exports and reviewed local imports remain supported.

## Validation and current limits

Automated coverage includes multi-session detection, medians/outliers, irregular evidence, text parsing, eight-week generation, duplicates/conflicts, series scopes, skip/end behavior, protected actual data, restart persistence, legacy migration, backup isolation and periodization integration. Browser tests exercise history → editable template → eight-week recurrence → protected occurrence edits, and pasted week → four-week reconstruction → bulk confirmation, on desktop and mobile Chromium.

Pattern alignment uses categories and time bands, not semantic understanding of exercises. Camps without recognizable labels may need manual exclusion. Missing logs remain a data gap. Fine-grained drag-and-drop, desktop shortcut commands, provider sync and calendar subscriptions are not implemented. Safari/Firefox and measured usability timings have not been validated.
