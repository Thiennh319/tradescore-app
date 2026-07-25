# Changelog

## V1.0.8 — Group/Hard Block export relabel

- Fixed: Score/Entry Trace & Review no longer mislabel Group Block as Hard Block (HB-/GB- IDs, GROUP blocker type, Hard/Group counters, softBlocks = scoreBlocks.length).
- Commit: `ae7489f` — export/display layer only; no `signalBoardScan` / UI SignalBoard change.
- Known follow-up: wire integration test for `softBlocks = scoreBlocks.length`; TASK 18.8 / package shells still uncommitted.

## V1.0.7 — TASK 18.6 / 18.6.1 (Option B)

- Fixed: RULEBOOK export label clarity (SCORE CONTRIBUTION → DISPLAY LAYER SCORES + new GROUP BREAKDOWN section) — export/label only, no scoring logic change
- Fixed: Hard Block field labels now show scope (Rule Trace Scope vs Engine/All Sources) to avoid confusion between RULE SUMMARY and BLOCKING SUMMARY counts
