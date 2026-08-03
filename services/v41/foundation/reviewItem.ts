/**
 * V4.1 Foundation — shared review row for UL Review, advisor, tooltip, popup.
 */

import type { V41EngineId } from './engineIds';
import type { V41EngineMetrics } from './metrics';

export type V41ReviewLevel = 'INFO' | 'WATCH' | 'WARN' | 'BLOCK' | 'CRITICAL';

export interface V41ReviewItem {
  id: string;
  level: V41ReviewLevel;
  title: string;
  description: string;
  source: V41EngineId | string;
  /** Optional numeric context — same metrics contract as engines. */
  metrics?: V41EngineMetrics;
}

export function createReviewItem(
  partial: V41ReviewItem,
): V41ReviewItem {
  return {
    id: partial.id,
    level: partial.level,
    title: partial.title,
    description: partial.description,
    source: partial.source,
    ...(partial.metrics ? { metrics: partial.metrics } : {}),
  };
}

export function createInfoReview(
  engineId: V41EngineId | string,
  idSuffix: string,
  title: string,
  description: string,
  metrics?: V41EngineMetrics,
): V41ReviewItem {
  return createReviewItem({
    id: `${engineId}:info:${idSuffix}`,
    level: 'INFO',
    title,
    description,
    source: engineId,
    metrics,
  });
}

export function createWarningReview(
  engineId: V41EngineId | string,
  idSuffix: string,
  title: string,
  description: string,
  level: V41ReviewLevel = 'WARN',
  metrics?: V41EngineMetrics,
): V41ReviewItem {
  return createReviewItem({
    id: `${engineId}:warn:${idSuffix}`,
    level,
    title,
    description,
    source: engineId,
    metrics,
  });
}

export function createBlockReview(
  engineId: V41EngineId | string,
  idSuffix: string,
  title: string,
  description: string,
  metrics?: V41EngineMetrics,
): V41ReviewItem {
  return createReviewItem({
    id: `${engineId}:block:${idSuffix}`,
    level: 'BLOCK',
    title,
    description,
    source: engineId,
    metrics,
  });
}
