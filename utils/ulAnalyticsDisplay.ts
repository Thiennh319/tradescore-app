/**
 * Task 15.8.2 — UL Analytics UI localization helpers (display only).
 * Does not mutate engines / VMs / APIs.
 */

import { vi } from '../constants/vi';

const ua = vi.ulAnalytics;

export const ulAnalyticsLabels = ua;

export function ulKpi(key: keyof typeof ua.kpi): string {
  return ua.kpi[key];
}

export function ulChart(key: keyof typeof ua.chart): string {
  return ua.chart[key];
}

export function ulCoin(key: keyof typeof ua.coin): string {
  return ua.coin[key];
}

export function ulRiskLevelVi(level: string): string {
  const map = ua.risk as Record<string, string>;
  return map[level] ?? ua.risk.Unknown;
}

export function ulEntryDecisionVi(decision: string): string {
  const map = ua.entry as Record<string, string>;
  return map[decision] ?? decision;
}

export function ulStrategyStatusVi(status: string): string {
  const map = ua.strategy as Record<string, string>;
  return map[status] ?? status;
}

export function ulPsychologyTraitVi(trait: string): string {
  const map = ua.psychology as Record<string, string>;
  return map[trait] ?? trait;
}

export function localizeUlPhrase(text: string): string {
  const trimmed = text.trim();
  const exact = ua.phrases[trimmed as keyof typeof ua.phrases];
  if (exact) return exact;
  return trimmed;
}
