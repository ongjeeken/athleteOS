# AthleteOS — current minimal tracker

The active app helps a busy fencing athlete decide how hard to train within their existing routine. Build a usual week, optionally add a Regular or Priority competition, then see the combined daily plan with secondary session guidance. Daily demand, suggestions, plan overrides and actual logging share **Light / Moderate / Hard**; actual effort stays independent of the plan. Empty days are **Rest**. Duration is never requested, displayed or used. Its two destinations remain **Today** and **Week**.

Start with [MINIMAL_TRACKER.md](MINIMAL_TRACKER.md) for the current workflow, storage limits, architecture and verification. This current-MVP section takes precedence over the legacy reference below.

## Run the current app

Requires Node.js 22.12+ and npm. With dependencies installed:

```sh
npm run dev
```

Open the local URL printed by Vite. For a production/offline preview:

```sh
npm run build
npm run preview -- --port 4173
```

Open http://127.0.0.1:4173 once online and allow the service worker to install before testing offline. The development server does not provide the production offline cache.

The MVP saves to localStorage in this exact browser profile and origin. It has no backup, export, import or synchronization UI. Clearing site data removes its records. Previous IndexedDB data remains untouched and is not migrated into this app.

## Current verification

The daily-demand follow-up recorded 182 passing unit/component/domain tests across 11 files (61 current tests and 121 retained legacy tests), a passing production build and formatting check, and 10 passing browser runs: 5 workflows on desktop and phone, including offline behavior. The browser suite intentionally selects `minimal.spec.ts`; retained legacy browser files are outside that run. The fresh full finish review returned ship with no fixes across four desktop/phone captures. Supplementary review of 645px Today Rest and the 17-session Week also returned ship with no regression; the visual evidence covers six captures.

## Deploy on Vercel

Import this GitHub repository into Vercel. The root `vercel.json` selects Vite, installs from the lockfile with the existing peer-dependency compatibility option, and builds `dist`. Node.js 22 is specified in `package.json`. No environment variables, backend or database service are needed.

The hosted site has its own browser storage. Records saved at the local development address do not automatically appear on the Vercel address; continue using the same hosted address for future training logs.

---

# Legacy reference — retained unchanged

The following text describes the previous broader application. Its workflows, storage and verification claims do not describe the current minimal tracker.

# AthleteOS

A working, local-first training workload and rolling periodization app for competitive fencers. No account, backend, API key, subscription, telemetry or cloud synchronization. Fencing is one activity; there are no weapon-specific settings.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci --legacy-peer-deps
npm run dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173). Complete the three-step Quick Start (competitions, typical week and objective), skip unknown information, or choose **Explore sample athlete** for an isolated fictional athlete.

Production/offline preview:

```sh
npm run build
npm run preview -- --port 4173
```

Open http://127.0.0.1:4173 once online, allow the service worker to finish caching, and reload. Thereafter the production app works offline, including logging and analytics. The development server intentionally does not register a service worker. Installation UI depends on the browser; localhost or HTTPS is required. Keep the same origin and port to access the same IndexedDB records. App updates can activate automatically; save open forms before reloading.

## Quick Start and historical training

The new Quick Start has local autosave, a visual weekly builder, optional competition entry and goals. It creates a provisional 14-day plan without inventing actual training or recovery. Reconstruction of 2/4/6 recent weeks is recommended; local CSV/ICS import and starting from today are equally available. Every historical occurrence stays unconfirmed until explicit review. See [QUICK_START.md](QUICK_START.md) for the workflow, provenance, supported file formats and limits.

## What works

- Today dashboard, next competition and priority, actual 7/28-day workload, recovery status, daily sessions, 42-day horizon, and up to three explained suggestions.
- Day/week/month calendar with tournament and plan creation, edits, deletion, rest days, rescheduling via date edits, locks, completed sessions and preparation windows. Tournaments have independent dates, goals, notes, locations and results.
- Fast completed-session entry across six activities. **Quick RPE is the default**: Very Easy (1), Easy (2), Moderate (3), Hard (5), Very Hard (7), Maximal (10). No preselected RPE. One tap selects effort; **Skip RPE** saves null. Detailed Mode offers every integer 0–10 inline. Switching preserves the rating. Settings → Training Logging controls the persistent default; temporary switches do not change it.
- Fencing exposure details, competition associations/results, conditioning distance/modality, strength exercises and individual sets/reps/kg/RPE/RIR. These metrics remain separate from session-RPE load.
- Daily wellness and optional symptom logging, personal medians requiring seven entries in the prior 14 days, recovery journal editing/deletion, symptoms and professional-assessment language.
- Interactive real-data load and recovery charts, daily/weekly views, activity/date filters, competition markers, category distribution, planned/completed comparison and accessible load tables.
- Deterministic competition-aware planning with A/B/C priorities, overlap handling, recent completed competition review, availability, rest, goals, fatigue observations, locked sessions, overrides, explicit acceptance/dismissal and original-plan undo.
- Personal/sample isolation, profile and preferences, light/dark/system themes, keyboard and mobile navigation, validated JSON export/restore and training/recovery CSV.

## Architecture

React 19 + strict TypeScript + Vite. Dexie/IndexedDB and live queries drive all screens. Radix Dialog handles focus and dismissal. React Hook Form powers quick session entry; Zod validates all records and imports. Recharts renders analytics. Self-hosted DM Sans, Lucide icons and CSS tokens keep the interface offline and themeable. Vite PWA/Workbox precaches local app assets.

`src/domain/` contains independently testable models, date functions, workload/recovery analytics, sample data and planner. `src/db.ts` owns normalized persistence, transactional mutations, backup validation and adjustments. `src/components/` owns shared entry forms and charts; `src/pages/` contains the five sections. [ARCHITECTURE.md](ARCHITECTURE.md) and [SPORTS_SCIENCE.md](SPORTS_SCIENCE.md) explain decisions and assumptions.

Completed sessions store `durationMinutes`, integer-or-null `rpe`, `rpeInputMode` and `sessionLoad`. Load is recalculated on every validated save and checked against duration/RPE on import; analytics independently derive load. This explicit invariant prevents stale redundant values. Planned duration and target RPE remain separate. Database schema 4 preserves schema 1/2/3 data and adds reusable templates, recurrence definitions and occurrence exceptions alongside historical staging and setup drafts. Backup schema 4 includes the new entities and provenance; valid schema 1/2/3 backups migrate on import. Unknown backup versions fail before writes. Future migrations must add a Dexie version and upgrade function rather than deleting storage.

## Privacy, backup and resilience

Data belongs to this browser profile and origin. Separate browsers, ports, hostnames and devices do not share records. No synchronization is implemented. Clearing site data, private-browsing cleanup, storage eviction or device loss can remove records. Export JSON backups regularly. CSV is for inspection; JSON is the complete restorable archive, including detailed sets, symptoms, preferences and audit records.

JSON backup restoration requires app identity and schema version 4 (or legacy schema 1/2/3), valid dates/types, unique IDs/check-in dates, correct load invariants and valid relationships. JSON restores **replace the active dataset** after an explicit content summary and confirmation. There is no duplicate merge. Replacement is atomic and never changes the other dataset. IDs and associations are namespaced to preserve isolation. Corrupted, oversized or incompatible files leave existing data untouched. CSV cells neutralize spreadsheet-formula prefixes.

Sample mode creates a separate profile and records marked `dataset: sample`. Returning to personal data does not copy anything across. Clearing sample data affects only that dataset; it can be recreated from Settings or onboarding. There is deliberately no one-click deletion of all personal data.

## Training entry and history-based planning

The default flow is select activity days → optional duration → date range → preview and apply. Onboarding, history, future planning and Settings reuse `ActivityDaySelector`. Saving the usual routine preserves all dated sessions. See [ACTIVITY_SETUP.md](ACTIVITY_SETUP.md).

Calendar and Insights open a shared activity-by-day selector with optional durations, independent same-day sessions, custom activities and an optional advanced calendar editor. Reusable templates, bulk actions and offline schedule pasting remain available. Completed history can generate an editable typical week, then a reviewed future recurrence. Existing, completed and individually edited records are protected. See [TRAINING_PLANNER.md](TRAINING_PLANNER.md) for the workflow, deterministic heuristics and recurrence behavior.

## Tests

```sh
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

Vitest + React Testing Library cover load boundaries, missingness, unique competition load, recovery medians, planner edge cases, mode switching, import validation, database transactions, sample isolation, preference persistence, acceptance and undo. Playwright runs onboarding, tournament and plan creation, planned completion, RPE entry/edit/skip, recovery, analytics, preference persistence, backup restoration, deletion, sample isolation and offline logging on desktop and narrow mobile Chromium. The browser test runner starts/reuses production preview on port 4173. Browser installation is required only for development tests.

## MVP limits and next improvements

Onboarding generates a provisional next 14 days. The weekly editor supports one-time copies, 2/4/8/12-week recurring plans, custom ranges and ongoing schedules. There is no automated intensity prescription, wearable integration, cloud sync, drag-and-drop calendar rescheduling, or coach sharing. Local historical CSV/ICS imports append reviewed records; they do not subscribe to a calendar service. Date edits reschedule sessions. The calendar is date/time based without timezone conversion of session times; the timezone determines the current athlete day. Weekly view intentionally shows six weeks ending at the selected endpoint, so an earlier partial range leaves excluded sessions out of totals. Recovery journal shows the latest 30 entries; all entries remain in JSON/CSV. Symptoms can be added/deleted; update a response with a new observation. There is no clinical triage or injury prediction.

Next: athlete/coach usability trials, Quick RPE measurement validation, richer strength progression, measured Quick Start usability, more flexible competition-block planning, and cross-browser offline testing. Review [SPORTS_SCIENCE.md](SPORTS_SCIENCE.md) before changing heuristics.

## Verification record

Validated with 121 Vitest unit/component/persistence/parser/migration tests and 24 Playwright browser workflows across desktop and mobile Chromium, including autosaved onboarding, historical review, file import, duplicate prevention, offline reload and logging. Production build and strict TypeScript checks pass. Production dependency audit reports zero known vulnerabilities; four low-severity advisories remain in transitive development/PWA build tooling (deepmerge), with no published compatible patch at implementation time.
