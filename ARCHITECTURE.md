# AthleteOS — current minimal architecture

The active entry point is `src/main.tsx`, which imports `src/minimal/Tracker.tsx` and the local DM Sans font. [MINIMAL_TRACKER.md](MINIMAL_TRACKER.md) describes the current workflow and operational limits. The legacy architecture below remains reference only.

| Module | Current responsibility |
| --- | --- |
| `src/minimal/Tracker.tsx` | Two-stage setup, Today, Week, inline editors and save/undo feedback |
| `src/minimal/model.ts` | Templates, dated sessions, competition, recommended intensity, override and actual-effort types |
| `src/minimal/schedule.ts` | Week materialization, stable occurrence identity and protected routine changes |
| `src/minimal/intensity.ts` | Pure deterministic intensity rules, bounded effort feedback, future refresh and known event context |
| `src/minimal/daily-demand.ts` | Pure qualitative combination of effective planned intensities, recovery and competition context |
| `src/minimal/daily-demand-ui.tsx` | Prominent Today demand, daily badges and explanation disclosures |
| `src/minimal/session-intensity.tsx` | Suggested intensity, activity-specific focus, explanation disclosure and independent plan override |
| `src/minimal/observations.ts` | One strategy based on displayed upcoming sessions before, on or after the event |
| `src/minimal/storage.ts` | Zod validation, localStorage reads/writes and separate setup draft |
| `src/minimal/tracker.css` | Active light-theme layout, typography, category and interaction styles |
| `src/domain/dates.ts` | Shared civil-date helpers used by the minimal app |

Persistence uses `athleteos-minimal-v1` and the independent setup key `athleteos-minimal-setup-v1`. Legacy IndexedDB records are retained untouched; there is no import or migration path into this MVP. React state is committed after a validated storage write; save failures are visible. Same-origin tabs listen for storage changes. Additive optional `recommendation`, `intensityOverride`, `competition.priority` and `competitionHistory` fields retain record version 1 and the same keys; existing records require no reset. Recommendation, override and reported effort are independent values. New actual logs use Light/Moderate/Hard. `StoredEffort` still accepts Easy/Normal; `effortIntensity` maps those labels for presentation without rewriting history. Legacy duration remains schema-compatible but is never requested, displayed or used.

Dates are local `YYYY-MM-DD` calendar dates; UTC is used only for date arithmetic, and weeks start Monday. Template occurrence IDs are `templateId@originalDate`; moving a session retains that ID. Removed occurrences stay as tombstones. Routine changes freeze elapsed dates and preserve completed, skipped, individually modified and one-off sessions while regenerating eligible future occurrences.

Daily demand derives from effective planned intensities, never actual effort or duration. It includes completed occurrences and excludes skipped/removed ones; recovery is excluded from accumulation while explicit overrides are respected. Competition days are Hard and empty days Rest. Missing historical recommendations use an explained Moderate-training/Light-recovery view fallback without writing a snapshot.

Intensity refresh materializes a small near-term horizon and recalculates only current/future planned suggestions. Past/completed snapshots never regenerate; older completed records without a recommendation stay unbackfilled. Replacing a passed current competition with a next event retains the previous date as context, without adding calendar UI. Setup selects the next relevant week when this week's routine days have elapsed.

React, TypeScript and Vite remain the app foundation, with local CSS, Lucide icons, localStorage and Zod. No dependencies were added for this MVP. Retained legacy packages and source are not evidence of active features; analytics, Dexie and the former five-section shell are outside the active import tree. Vite PWA/Workbox supplies the production offline cache after installation.

`npm run build` checks TypeScript and produces the app. `npm test` runs current and retained unit tests. `npm run test:e2e` runs only `minimal.spec.ts` on desktop and mobile; it intentionally excludes the retained legacy browser suites. See the guide for the recorded verification results and limits.

---

# Legacy reference — retained unchanged

The following text describes the previous broader application. Its workflows, storage and verification claims do not describe the current minimal tracker.

# Architecture and implementation checklist

- [x] Versioned Zod domain entities and IndexedDB tables
- [x] Pure calendar-date analytics and deterministic rolling planner
- [x] Isolated personal/sample datasets, onboarding, session and tournament CRUD
- [x] Recovery, symptoms, strength sets and fencing exposure
- [x] Dashboard, interactive analytics, day/week/month calendar
- [x] Audited, reversible recommendation application and phase overrides
- [x] Validated backups, CSV, offline PWA, responsive themes
- [x] Domain, persistence, component and browser workflow tests

React presents data from Dexie live queries. Each normalized table has a dataset key; switching demo mode never mutates personal records. Completed session load is recalculated on each save, validated on import, and independently derived by analytics; its stored value provides the requested shared RPE data structure. Local YYYY-MM-DD values carry athlete calendar dates; UTC arithmetic prevents DST/timezone drift. Weeks start Monday. The planner takes explicit data and date inputs, emits at most three explainable recommendations, and never writes the database. Explicit acceptance creates an audit record of the original planned session. All database writes are awaited and surfaced on failure. JSON imports validate every entity and relationship before an atomic replacement of the active dataset. Schema 4 backups include historical provenance, templates, recurrences and exceptions; legacy schema 1/2/3 backups migrate safely. Unknown versions fail before writes.

Quick Start uses a separate autosaved setup draft until atomic finalization into the existing profile, tournament and planned-session tables. The weekly generator creates proposed future sessions only. Historical staging stores unconfirmed/missed proposals and audit associations; explicit confirmation creates the existing canonical CompletedSession or Tournament. CSV/ICS parsing, recurrence expansion and timezone conversion run locally in domain modules. Schema 2 adds history/setup tables without overwriting schema 1 records. See QUICK_START.md for limits and field-level provenance.

The shared weekly editor supports local deterministic text parsing and history pattern detection. Templates retain optional source session references; recurrence definitions expand into independent planned occurrences. Exception records protect skips and individual edits. Schema 3 adds three tables and a series index without replacing existing data. Bulk saves, series edits and duplicate rechecks are transactional. The existing planner evaluates proposed schedules before saving. See TRAINING_PLANNER.md.

ActivityDaySelector is the only default weekly-entry component across onboarding, Quick Start and TrainingWorkspace; WeeklyEditor is nested as its advanced option. Routine saves are transactionally separate from dated schedule application. Schema 4 broadens routine/planned duration to nullable and retains custom activity labels while preserving the canonical completed-session invariant. See ACTIVITY_SETUP.md.
