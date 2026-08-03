/**
 * Task 15.0.1 — Plug-in runner (future Session / Funding / Whale / …).
 * Plugins patch dashboard only; they must not reverse-call core layers.
 */

import type { ULAnalyzerPlugin, ULDashboardData, ULTradeInput } from './types';
import { UL_ANALYTICS_VERSION } from './types';

export function applyUlPlugins(
  dashboard: ULDashboardData,
  trades: readonly ULTradeInput[],
  plugins: readonly ULAnalyzerPlugin[] | undefined,
): ULDashboardData {
  if (!plugins || plugins.length === 0) return dashboard;

  let result = dashboard;
  for (const plugin of plugins) {
    const patch = plugin.analyze(result, trades);
    result = {
      ...result,
      ...patch,
      // Protect identity fields from accidental overwrite
      version: UL_ANALYTICS_VERSION,
      fingerprint: result.fingerprint,
      tradeCount: result.tradeCount,
    };
  }
  return result;
}
