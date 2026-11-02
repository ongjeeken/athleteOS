# AthleteOS minimal tracker

This guide describes the app loaded by `src/main.tsx`. The supplied minimal-tracker brief, its intensity-guidance and daily-demand follow-ups and [.impeccable/minimal-direction.md](.impeccable/minimal-direction.md) govern the current scope. Older documents and source remain available as legacy reference; they do not add features to this MVP.

## Use the app

1. **Usual routine:** choose a session category and tap its days. Tap a day again to add another independent session. Fencing and gym can share a day. No duration is requested and no effort history is required during setup.
2. **Optional competition:** enter the next competition, optionally mark it Regular or Priority (Regular is the default), or choose **Skip for now**. This is the second and final setup stage.

Completion opens a personalized Monday–Sunday **Week** with full daily-demand labels, secondary session recommendations and one short overall strategy. If this week's routine days have already elapsed, it opens the next relevant week. **Go to today** leads to daily logging. Later reloads open **Today** without repeating setup. Setup progress is saved separately until completion.

Today leads with **Today’s demand**, a prominent **Light / Moderate / Hard** label or neutral **Rest**, visibly described as a provisional daily plan. Session suggestions and activity-specific focus are secondary. Open **Why / adjust intensity** for the rule or an independent planned override. Tap **Light**, **Moderate** or **Hard** to log actual effort immediately; it can differ from the suggestion or override and does not change that day's planned demand. Undo returns the session to planned. Notes remain optional secondary details. Duration is never requested, displayed or used; any older saved value is retained only for compatibility.

Week shows full daily labels across seven days, with four then three cells on phone, followed by individual planned/completed/skipped sessions. Accessible day labels include session names, plan details and actual effort. Navigate previous/next weeks, add one-offs, move or skip individual sessions, or remove one with undo. Routine and competition editing remain separate inline views.

There are exactly two primary navigation destinations: Today and Week. The app starts without sample completed training. Logging under 10 seconds and setup under 60 seconds are intended experience targets; no timed usability study is claimed.

## What daily demand means

Daily demand combines effective planned intensities—personal overrides first, then saved suggestions—using qualitative rules. Any Hard session makes the day Hard. Two Moderate training sessions, or one Moderate plus at least two Light training sessions, also make it Hard. Three Light training sessions make a Moderate day. Otherwise a Moderate session sets Moderate; Light-only or recovery-only days start Light. Recovery/mobility does not add to training counts, while an explicit Moderate or Hard recovery override is still honored. No active sessions means Rest; a known competition makes the day Hard even if additional training is Light.

Completed sessions stay in the day's plan; skipped and removed sessions do not. Actual effort and legacy duration never enter this combination. If a historical recommendation is missing, the view explains a Moderate training / Light recovery starting point without saving invented history. The daily label is a provisional relative plan, not a numerical workload, physiological measure, fatigue estimate or readiness score.

## How intensity guidance works

Light, Moderate and Hard describe the demand of the particular activity. Light fencing emphasizes technical work; Light gym reduces volume or uses manageable loads; Light conditioning is easy aerobic work. Other activities use generic guidance. The suggestion, the athlete's planned override and their reported actual effort remain three independent values. Recommendations never prevent logging a different actual effort.

The deterministic engine keeps the existing days and varies demand. It recommends at most two Hard sessions per week, or one when there are at least eight training sessions or six training days. Model-selected Hard opportunities are spaced apart, do not stack on double days and give way to Moderate within longer training runs. Every fourth consecutive scheduled training day starts Light; recovery/mobility always starts Light. Skipped and removed occurrences are excluded. Athlete overrides remain choices, rather than enforced limits.

Regular events use a short window: two days before starts Moderate, the day before Light. Priority events reduce gym/conditioning demand four days before, keep fencing controlled, then make the final two days Light. Additional training on event day starts Light; a day after a known previous event also starts Light. Replacing a passed current event with the next event retains its date for this context. There is no additional competition-calendar UI.

Recent effort has one bounded effect: if at least three of the five most recent completed training sessions in the past seven days were Hard, potential Hard recommendations become Moderate through two days after the latest Hard session. It never estimates fatigue or turns all future training Light. Future planned recommendations refresh when relevant inputs change; past/completed recommendation snapshots never regenerate. Older completed version-1 records without a snapshot receive no invented recommendation.

One weekly strategy summarizes the displayed upcoming sessions before, on and after the event, while session disclosures give the specific reason. An event at the start of a week prompts Light extra training on event day and normal training afterward, rather than taper instructions for days outside that view. Day-after-only context has its own strategy. These conservative product heuristics are adjustable starting points, not an optimized prescription. The app does not calculate training load, infer recovery or readiness, predict injury, generate AI coaching or recommend rearranging fixed training days.

## How recurring sessions stay independent

Routine entries are templates. Materialized occurrences have stable IDs of the form `templateId@originalDate`, with a separate current date. Moving an occurrence retains its original identity. Skips and individual edits remain protected exceptions. Removal keeps a hidden tombstone so routine expansion cannot recreate the removed occurrence.

Routine changes first materialize elapsed dates, then preserve historical sessions, logs, skips, individual edits and one-offs. Only eligible unmodified future planned occurrences regenerate. Weeks before the initial setup week are not reconstructed as invented training history. A new week's occurrences are generated when that week is opened; no background service runs while the app is closed.

Civil dates use local `YYYY-MM-DD` values and the browser's current local timezone. Calendar arithmetic uses UTC internally to avoid daylight-saving drift. Weeks start Monday. Changing timezone can change which civil date is Today; the stored session dates remain date labels, not instants.

## Local data and limits

The versioned active record is stored in localStorage under `athleteos-minimal-v1`. Optional recommendation snapshots, plan overrides, competition priority and previous-event context extend the existing version-1 record without resetting data. The setup draft uses `athleteos-minimal-setup-v1`. Zod validates the active record before writes and on reads. Save failures are shown instead of reporting a successful save. Other tabs at the same origin receive storage-change events; simultaneous edits are not a collaborative merge system.

Data belongs to the exact browser profile and origin: scheme, hostname and port all matter. `localhost`, `127.0.0.1`, development and preview ports are separate stores. Different devices or browsers do not share data. Clearing site data, browser cleanup, storage eviction or device loss can remove it. This MVP has no backup, export, restore or synchronization UI.

The previous application's IndexedDB data remains untouched. It is neither imported nor migrated into the minimal tracker. The active app does not expose legacy analytics, recovery questionnaires, detailed strength sets, historical imports, sample mode, account management, dark theme or the former five-section navigation.

## Run and verify

Requires Node.js 22.12+ and npm. Install the existing lockfile dependencies if needed with `npm ci --legacy-peer-deps`; no new dependencies were introduced for this MVP.

```sh
npm run dev
```

Use the URL printed by Vite. The production preview is:

```sh
npm run build
npm run preview -- --port 4173
```

Open http://127.0.0.1:4173 once while online and allow the service worker to install. Production offline reload and logging were verified after this first load. The development server does not register that production cache. Installation depends on browser support and localhost or HTTPS. Keep using the same origin to find the same saved training.

```sh
npm test
npm run build
npm run test:e2e
```

The daily-demand follow-up recorded 182 passing unit/component/domain tests across 11 files (61 current tests and 121 retained legacy tests), a passing production build and formatting check, and 10 passing browser runs: 5 workflows on desktop and phone, including offline behavior. The browser suite intentionally selects `minimal.spec.ts`; retained legacy browser files are outside that run. The fresh full finish review returned ship with no fixes across four desktop/phone captures. Supplementary review of 645px Today Rest and the 17-session Week also returned ship with no regression; the visual evidence covers six captures. Playwright requires installed Chromium for development browser tests (`npx playwright install chromium`).

## Source map and visual system

React and TypeScript run through Vite. `src/minimal/Tracker.tsx` owns the interaction surfaces; `model.ts`, `schedule.ts`, `intensity.ts`, `observations.ts` and `storage.ts` separate the data contract, calendar behavior, intensity engine, weekly strategy and persistence. `session-intensity.tsx` presents session guidance and its independent override. `daily-demand.ts` derives the combined day; `daily-demand-ui.tsx` renders its badge and explanation. Old Easy/Normal actual values remain stored and display as Light/Moderate; the localStorage key and record version remain unchanged. Shared date helpers remain in `src/domain/dates.ts`. CSS is in `src/minimal/tracker.css`. The existing local font and Lucide icons are used; Radix and the broader legacy packages remain installed but are not used by the minimal UI. Tailwind was not added.

[DESIGN.md](DESIGN.md) and [.impeccable/design.json](.impeccable/design.json) record the active visual system extracted from this code. DM Sans and evergreen/chalk/sage colors retain AthleteOS's identity. Today prioritizes daily demand, then session guidance and logging. Desktop keeps supporting information in a narrow second column; mobile Week places the strategy between the week strip and agenda. Light, Moderate and Hard share restrained sage, slate and warm-amber treatments across daily demand, recommendations, overrides and actual logging; Rest uses a neutral treatment. There are no generated images or new raster assets.
