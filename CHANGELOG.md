# Changelog

## V1.0.8 — NEAR S1/S3 + Ambiguity 2.5 + UI U1 (rebuild 2026-08-02)

- NEAR SHORT V4: gate S1 L3≥1.5 hard block (NEAR-only) + S3 L3≥2 label «tín hiệu mạnh».
- Ambiguity threshold 1.0→2.5 (shared V3+V4, BTC/SOL/BNB/NEAR); hysteresis 2-scan giữ nguyên.
- Signal Board U1: chỉ nút hướng `suggestDirectionV4` active; nút kia disabled/mờ; AMBIGUOUS → cả 2 mờ.
- Không đổi: NEAR LONG floors; `unifiedSignalEngine.resolveV4Signal` (Option A tech-debt).
- Rebuild APK + Web EXE trên cùng v1.0.8 (buildDate 2026-08-02).

## V1.0.8 — NEAR Breakout Confirm B (RC3) + rebuild 2026-08-01

- NEARUSDT: RC3 dùng Breakout Confirm B (Donchian N20/X5, retest, ATR SL×1.0, TP 1.5R) thay Trend Reversal; BTC/SOL/BNB giữ TR.
- Path A EMA-retest tắt cho NEAR; rulebook/export branch breakout; UI note `TP1 only · 1.5R`.
- Production pipeline verify: n=31, WR≈53.33%, E[R]≈+0.254 (365d); H2 OOS khớp research.
- Rebuild APK + Web EXE trên v1.0.8 (buildDate 2026-08-01).

## V1.0.8 — Group/Hard Block export relabel

- Fixed: Score/Entry Trace & Review no longer mislabel Group Block as Hard Block (HB-/GB- IDs, GROUP blocker type, Hard/Group counters, softBlocks = scoreBlocks.length).
- Commit: `ae7489f` — export/display layer only; no `signalBoardScan` / UI SignalBoard change.
- Known follow-up: wire integration test for `softBlocks = scoreBlocks.length`; TASK 18.8 / package shells still uncommitted.

## V1.0.7 — TASK 18.8 (BLOCKING EVENTS ORIGIN label) — CLOSED

- Fixed: `# HARD BLOCK ORIGIN` → `# BLOCKING EVENTS ORIGIN` + intro; BLOCKING SUMMARY cross-link; `Hard/Group Blocked State` export label + footnote (all 5 traces; export only).
- Report: `docs/TASK18_8_HARD_BLOCK_ORIGIN_LABEL_AUDIT.md`
- Production sample: `docs/RULE_TRACE_TASK18_8_BTCUSDT_SHORT_v4_PRODUCTION.md`

## V1.0.7 — TASK 18.7 (Score Trace label clarity) — CLOSED / SIGNED OFF

- Fixed: Score Trace SCORE TABLE / COMPONENTS — Contribution → Display Layer Score; Raw Score → Decision Total (snap.score); added GROUP BREAKDOWN + scale disclaimer + SCORE TRACE INTERPRETATION section (export/label only; same root cause as Option B).
- Docs: `docs/TASK18_7_SCORE_TRACE_LABEL_CLARITY.md`
- Samples: `docs/SCORE_TRACE_TASK18_7_BTCUSDT_LONG_v4_FIXTURE_SAMPLE.md`, `docs/SCORE_TRACE_TASK18_7_BTCUSDT_LONG_v4_PRODUCTION_SAMPLE.md`
- Evidence: `docs/TASK18_7_VITEST_VERBOSE.log` (49 passed)
- Note: `scorerV4.ts` L10 reason-text WT remains out of scope (separate from 18.7)

## V1.0.7 — TASK 18.6.4 (Engine Score + SCORE_BLOCKED audit) — CLOSED

- Audited: Final Score 8.65 matches `+(A+B+C).toFixed(2)` exactly — Score Engine math PASS; formula LOCKED.
- Audited: Entry State SCORE_BLOCKED with Score Block Count 0 is intentional — PASS.
- Enhancement: TRACE INTERPRETATION note #10 (SCORE_BLOCKED vs Score Block Count).
- Backlog: persist rawLayerScores on snapshot (not implemented).

## V1.0.7 — TASK 18.6.3 (GROUP BREAKDOWN rounding)

- Fixed: GROUP BREAKDOWN Group Score / Raw Sum* / Decision Total Markdown cells now round to ≤2 decimal places (display-only; no scoring logic change). Prevents leaking long JS floats (e.g. `2.0833333333333335`) from production `groupScores`.

## V1.0.7 — TASK 18.6 / 18.6.1 (Option B)

- Fixed: RULEBOOK export label clarity (SCORE CONTRIBUTION → DISPLAY LAYER SCORES + new GROUP BREAKDOWN section) — export/label only, no scoring logic change
- Fixed: Hard Block field labels now show scope (Rule Trace Scope vs Engine/All Sources) to avoid confusion between RULE SUMMARY and BLOCKING SUMMARY counts
