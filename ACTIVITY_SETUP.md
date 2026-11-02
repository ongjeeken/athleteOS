# One weekly routine, three uses

`ActivityDaySelector` is the default interaction in onboarding, historical reconstruction, future planning and Settings → My Usual Training Week. Each entry point passes its context, existing rules and actions into this component. The detailed `WeeklyEditor` is available only through **Advanced weekly calendar editor** inside the selector.

## Describe the week once

The selector asks “Which days do you usually do each type of training?” Fencing, Strength / Gym, Conditioning and Mobility / Recovery form the default rows; Monday–Sunday are toggle columns. A selected cell represents training on that day. Multiple activities on a day stay independent. The live weekly count includes each selected occurrence and each additional same-type session.

Typical duration can be entered once per activity and is optional. Blank durations remain `null`. Optional details expose time-of-day preferences, exact starting times and subtypes. “+ Another Session” adds a new independent rule/identifier and shows the count in the day cell; optional individual details or the advanced editor distinguish its time and duration. Toggling an activity/day off clears that activity’s occurrences on that day, retaining its other days.

Custom activities retain a `customActivity` label through templates, plans, completed sessions, history, JSON backup and CSV export/import. They use the existing Other category for the established analytics taxonomy. Separate custom activities remain separate during history pattern detection.

## Reuse without re-entry

Initial setup saves the routine in the existing profile and in the default **My Usual Training Week** template, then creates the provisional 14-day calendar. It creates no completed sessions or recovery measurements.

Calendar → **Plan Training** and **Reconstruct History** preload the saved routine. **Use My Usual Training Week** restores it to the current editor. **Use My Recent Training** opens the existing deterministic pattern detector using confirmed completed sessions. The detected week is editable in the same selector and does not replace the saved routine automatically.

Saving **My Usual Training Week** updates only the profile routine, availability, frequency and its default template. It does not regenerate, delete or overwrite any existing plan, recurrence, exception or completed workout. Applying changes to dates remains a separate reviewed action.

## Historical use

Select activities/days, optionally set durations, choose a past range and preview. Historical occurrences begin unconfirmed, with missing RPE and missing durations as null. Known reconstructed durations retain estimate metadata. Confirm individually or through the existing selected/range review, mark missed, correct exceptions or leave uncertain. A proposal lacking duration can remain unconfirmed; entering a duration is required before making it a canonical completed workout. No RPE is inferred.

## Future use and editing scope

Select activities/days, choose a date range, then review and apply a one-time plan or recurrence. Existing sessions and actual history remain separate. Duplicate/conflict detection, recurrence exceptions, periodization review and protected individual edits use the existing planning/storage services.

For relevant generated/recurring sessions, the calendar’s edit form offers:

- **Change this session only** — the default; preserves the usual routine.
- **Change this week only** — updates matching activity/title/time-band sessions in that calendar week. Completed sessions, other explicit edits and other locked sessions stay protected.
- **Change future occurrences** — opens the shared selector with the changed recurring rule, then requires preview and save.
- **Update my usual training week** — opens the shared selector with a proposed routine change. The athlete explicitly saves it; existing dated records remain intact.

Sparse data and unknown planned durations do not produce numeric workload or duration-reduction suggestions. Actual analytics still consume only canonical completed sessions once. Planned chart load remains unknown when a target duration or RPE is missing.

## Compatibility and validation

IndexedDB schema 4 preserves schemas 1–3 in place. It seeds a default usual-week template for existing profiles that already have a routine. The model permits null routine/planned duration and optional custom activity labels. Completed sessions retain their valid actual-duration invariant. JSON backup schema 4 accepts legacy schema 1/2/3 backups without changing known duration values or actual history.

Automated tests cover the shared component in every context, per-activity durations, stable same-day identifiers, custom activities, null values, the optional advanced editor, routine-only updates, week scopes, existing-history preservation, migration and existing recurrence/analytics behavior. Browser tests cover onboarding → future planning → individual edit → proposed routine change → Settings reuse, and onboarding → historical reconstruction → bulk confirmation → recent-pattern reuse, on desktop and mobile Chromium.

The grid supports keyboard focus and button activation. Touch controls have descriptive activity/day labels and selected states. The mobile layout keeps duration beside the activity and the seven day toggles together. Drag-and-drop and shortcut commands remain outside this change. Safari/Firefox and timed usability studies remain unverified.
