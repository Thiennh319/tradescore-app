/**
 * Task 15.0.1 — Fingerprint + version cache.
 * Key = UL_ANALYTICS_VERSION + fingerprint. Version bump invalidates.
 */

import type { ULDashboardData } from './types';
import { UL_ANALYTICS_VERSION } from './types';
import { buildCacheKey } from './ULInputAdapter';

type CacheEntry = {
  key: string;
  data: ULDashboardData;
};

let cache: CacheEntry | null = null;

export function getUlCacheKey(fingerprint: string): string {
  return buildCacheKey(fingerprint, UL_ANALYTICS_VERSION);
}

export function readUlCache(fingerprint: string): ULDashboardData | null {
  const key = getUlCacheKey(fingerprint);
  if (cache && cache.key === key) return cache.data;
  return null;
}

export function writeUlCache(fingerprint: string, data: ULDashboardData): void {
  cache = { key: getUlCacheKey(fingerprint), data };
}

export function clearUlAnalyticsCache(): void {
  cache = null;
}

export function getUlCacheFingerprint(): string | null {
  if (!cache) return null;
  return cache.data.fingerprint;
}
