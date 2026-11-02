# AthleteOS — current MVP product contract

The current product helps a busy fencing athlete decide how hard to train within a routine they cannot easily rearrange, then log what they actually did in seconds. [MINIMAL_TRACKER.md](MINIMAL_TRACKER.md) is the active implementation guide; the supplied minimal-tracker brief, its intensity-guidance and daily-demand follow-ups and [.impeccable/minimal-direction.md](.impeccable/minimal-direction.md) govern this version.

Exactly two setup stages capture the usual weekly routine and an optional next competition; optional event priority defaults to Regular. Completion opens the next relevant personalized Week with full daily-demand labels and secondary session guidance. Returning users open Today, led by a prominent daily demand label and provisional context. Light, Moderate and Hard save actual effort immediately, independently of the suggestion or a plan override. Notes remain secondary. Duration is never requested, displayed or used; legacy stored values remain untouched. Individual sessions can be moved, skipped, removed with undo or added independently; usual-routine editing remains separate.

The two primary destinations are Today and Week. One short weekly strategy explains the displayed upcoming sessions before, on or after an event without advising schedule rearrangement. Week shows full Light/Moderate/Hard daily labels and neutral Rest states, followed by individual session guidance; phone days form a four-then-three grid. Daily demand qualitatively combines planned sessions, honors overrides and includes completed sessions while excluding skipped/removed occurrences. Recovery does not accumulate like training, and competition days are Hard. This is a provisional relative plan rather than a physiological workload measurement. Suggestions account for activity, schedule density, short Regular/Priority event windows and bounded recent effort; native disclosures explain each suggestion and permit an independent plan override. Future planned suggestions refresh; past/completed snapshots and actual logs remain unchanged, and older completed records receive no invented guidance. There is no physiological inference, readiness score, analytics dashboard, AI coach or exercise-level strength tracking.

Keep the existing AthleteOS identity: locally served DM Sans, evergreen actions, chalk ground, sage support surfaces, accessible controls and a phone-first daily task. The active app is local only, has no authentication or external service, and begins without fabricated completed sessions. Setup under 60 seconds and daily use under 10 seconds are product targets, not measured usability findings.

Older stored Easy/Normal actual efforts remain unchanged and display as Light/Moderate. Missing historical suggestions remain unsaved; the daily view explains its Moderate-training/Light-recovery fallback. Browser-local storage has no backup/export/sync UI in this MVP. Historical imports and the broader legacy product remain out of scope. The legacy text below is retained as reference and does not expand the active product contract.

---

# Legacy reference — retained unchanged

The following text describes the previous broader application. Its workflows, storage and verification claims do not describe the current minimal tracker.

# AthleteOS

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-preferred React, TypeScript, Vite, Dexie, Recharts, React Hook Form, Zod, Vitest and Playwright. Local only; no publishing or remote backend.

## Users

Competitive fencers balancing frequent tournaments, training, recovery and ordinary work or study commitments.

## Product Purpose

Explain how to adjust a rolling training plan around competition priority and individual observations. Success is fast logging and an actionable, reversible suggestion.

## Positioning

Competition-aware, explainable planning with device-owned data and athlete autonomy.

## Capabilities and Constraints

Five sections: Today, Calendar, Log Training, Insights, Settings. Offline PWA. Separate sample dataset. No account, telemetry, synchronization, injury prediction or readiness score. All changes persist. Research and heuristics remain clearly distinguished.

## Brand Commitments

AthleteOS. Calm, professional, readable athletic software, restrained colors, light and dark themes, accessible keyboard and mobile navigation. Every action works.

## Product Principles

Rolling planning; personal context; transparent uncertainty; minimal friction; athlete control.

## Evidence on Hand

User's comprehensive brief and six cited PubMed records. Sample fencer is fictional. No supplied imagery or logo.

## Accessibility & Inclusion

Labeled controls, visible focus, large touch targets, responsive screens, consistent scale directions.

## Decisions delegated in the brief

User explicitly requested autonomous implementation without unnecessary clarification. Implementation choices use that authorization. Assume Singapore timezone initially, editable by athlete.

## Quick Start enhancement

Three progressive steps: competition schedule, typical week, objective. All historical data and recovery context are optional. Autosave local progress and show a provisional 14-day calendar immediately. Optional reconstructed or imported history is reviewed before confirmation; estimated field values and missing RPE remain explicit. Existing training is preserved and profiles remain editable. Setup speed of 2–3 minutes is a design target, not a tested claim.

## Fast training entry

A unified weekly editor serves historical reconstruction and future recurrence. Completed history can generate an editable, explainable template with independent same-day sessions and median durations. Saved templates and deterministic offline text input reduce repetition. Future application is reviewed for duplicates, competition conflicts and availability. Completed and explicitly edited occurrences remain protected. Ongoing schedules extend locally on later app use, with no closed-app background service.

## Unified activity setup

The default weekly entry uses one shared activity-by-day selector in onboarding, history, future planning and Settings. Duration is optional and unknown values remain null. Multiple activities and same-type sessions remain independent. Saving the usual routine never changes dated training. Individual edits expose relevant session/week/future/usual scopes; the detailed calendar is secondary.
