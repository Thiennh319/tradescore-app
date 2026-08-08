/** Release metadata — đồng bộ BUILD_INFO APK/EXE và guideline. */
import { BUILD_DATE_YMD } from './buildDate.generated';

export const BUILD_INFO = {
  version: '1.0.8',
  /** Set at build via scripts/stamp-build-date.mjs (Asia/Ho_Chi_Minh YYYY-MM-DD). */
  buildDate: BUILD_DATE_YMD,
  changelog: [
    'NEAR SHORT V4: S1 L3≥1.5 hard (NEAR-only) + S3 L3≥2 nhãn tín hiệu mạnh',
    'Ambiguity threshold 2.5 (V3+V4, 4 coin) + Signal Board U1 (1 nút active / mờ khi ambiguous)',
    'Rebuild APK + Web EXE v1.0.8 (buildDate từ stamp lúc build)',
    'Rulebook NEAR: Source Module rules 03–12 = marketContextFilter/decisionConfig/decisionEngine (Task 6b); Reason breakout (Task 6); Evidence + split breakout_context / breakout_confirmed_active (Task 7/7b)',
    'NEARUSDT: chiến lược Breakout Confirm B (Donchian N20/X5, ATR SL×1.0, TP 1.5R) thay Trend Reversal trên RC3',
    'BTC/SOL/BNB giữ Trend Reversal; Path A EMA-retest tắt cho NEAR; rulebook/export branch breakout',
    'UI card breakout: ghi chú TP1 only · 1.5R; regression test TR BTC/SOL/BNB',
    'UL Analytics Engine + Performance HT dashboard (Phase 15)',
    'Trading Coach + Portfolio Advisor (tiếng Việt)',
    'Entry Quality Engine + Explainability',
    'Trace Export: RuleBook / Score / Entry / Position / TradePlan (Phase 16)',
    'AI Review Export: 5 báo cáo tự chứa RULEBOOK / SCORE / ENTRY / POSITION / TRADEPLAN (Phase 17)',
    'Menu Xuất dữ liệu: nhóm Trace Export + AI Review Export, copy + download Markdown',
    'Journal Intelligence + Statistics / Performance / Dashboard Intelligence panels',
    'Fix VWAP entry direction validation (LONG/SHORT limit khớp ngay → NEUTRAL)',
    'Fix TradePlan export CONFLICT DETECTION: positionState from openTrades (OPEN|NONE), rule WAIT/AVOID+OPEN',
  ],
  features: [
    'NEAR SHORT S1/S3 L3 gates + Ambiguity 2.5 + Signal Board U1',
    'NEARUSDT Breakout Confirm B trên RC3 (các coin khác Trend Reversal)',
    'NEAR rulebook: Reason Task 6 + Evidence Task 7 + split breakout_context / breakout_confirmed_active (Task 7b)',
    'UL Analytics Engine + Performance HT dashboard (Phase 15)',
    'Trading Coach + Portfolio Advisor (tiếng Việt)',
    'Entry Quality Engine + Explainability',
    'Trace Export: RuleBook / Score / Entry / Position / TradePlan (Phase 16)',
    'AI Review Export: 5 báo cáo tự chứa RULEBOOK / SCORE / ENTRY / POSITION / TRADEPLAN (Phase 17)',
    'Menu Xuất dữ liệu: nhóm Trace Export + AI Review Export, copy + download Markdown',
    'Journal Intelligence + Statistics / Performance / Dashboard Intelligence panels',
    'Fix VWAP entry direction validation (LONG/SHORT limit khớp ngay → NEUTRAL)',
    'Fix TradePlan export CONFLICT DETECTION: positionState from openTrades (OPEN|NONE), rule WAIT/AVOID+OPEN',
  ],
  testCount: 2374,
} as const;
