/**
 * Task 14.4.1 — Invalidate all Trading Intelligence caches when Journal mutates.
 */

import { clearDashboardIntelligenceCache } from '../dashboard';
import { clearJournalIntelligenceCache } from '../journalIntelligence';
import { clearPerformanceIntelligenceCache } from '../performance';
import { clearStatisticsIntelligenceCache } from '../statistics';

export function invalidateAllIntelligenceCaches(): void {
  clearJournalIntelligenceCache();
  clearStatisticsIntelligenceCache();
  clearPerformanceIntelligenceCache();
  clearDashboardIntelligenceCache();
}
