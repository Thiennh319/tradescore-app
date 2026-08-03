/**
 * Phase 14 — Parse projected tags from TI View (AiTradeJournalEntry.tags).
 * Không đọc Event Store.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';

export type ParsedAdviserTag = {
  sequence: number;
  advisorActionCode: string;
  advisorReasonCode: string;
};

export type ParsedProjectedMeta = {
  isProjected: boolean;
  triggerCode: string | null;
  decisionCode: string | null;
  strategyVersion: string | null;
  confidence: number | null;
  featureSetVersion: string | null;
  engineVersion: string | null;
  /** From tags `projectionVersion:` or derived composite (Rule #65 cache key) */
  projectionVersion: string | null;
  adviserTimeline: ParsedAdviserTag[];
};

/**
 * Resolve projectionVersion for cache (Rule #65).
 * Prefer explicit tag; else stable composite from TI View versions.
 */
export function resolveProjectionVersion(meta: ParsedProjectedMeta, entry: AiTradeJournalEntry): string {
  if (meta.projectionVersion) return meta.projectionVersion;
  const parts = [
    meta.featureSetVersion ?? '',
    meta.engineVersion ?? '',
    meta.strategyVersion ?? '',
    entry.version ?? '',
  ];
  const joined = parts.join('|');
  return joined === '|||' ? `legacy:${entry.id}` : joined;
}

export function parseProjectedTags(entry: AiTradeJournalEntry): ParsedProjectedMeta {
  const tags = entry.tags ?? [];
  const meta: ParsedProjectedMeta = {
    isProjected: tags.includes('projected'),
    triggerCode: null,
    decisionCode: null,
    strategyVersion: entry.strategySource ?? null,
    confidence: null,
    featureSetVersion: null,
    engineVersion: null,
    projectionVersion: null,
    adviserTimeline: [],
  };

  for (const tag of tags) {
    if (tag.startsWith('triggerCode:')) meta.triggerCode = tag.slice('triggerCode:'.length);
    else if (tag.startsWith('decisionCode:')) meta.decisionCode = tag.slice('decisionCode:'.length);
    else if (tag.startsWith('strategyVersion:')) meta.strategyVersion = tag.slice('strategyVersion:'.length);
    else if (tag.startsWith('confidence:')) {
      const n = Number(tag.slice('confidence:'.length));
      meta.confidence = Number.isFinite(n) ? n : null;
    } else if (tag.startsWith('featureSetVersion:')) {
      meta.featureSetVersion = tag.slice('featureSetVersion:'.length);
    } else if (tag.startsWith('engineVersion:')) {
      meta.engineVersion = tag.slice('engineVersion:'.length);
    } else if (tag.startsWith('projectionVersion:')) {
      meta.projectionVersion = tag.slice('projectionVersion:'.length);
    } else if (tag.startsWith('adviser:')) {
      const parts = tag.split(':');
      // adviser:seq:action:reason
      if (parts.length >= 4) {
        const sequence = Number(parts[1]);
        meta.adviserTimeline.push({
          sequence: Number.isFinite(sequence) ? sequence : meta.adviserTimeline.length + 1,
          advisorActionCode: parts[2]!,
          advisorReasonCode: parts.slice(3).join(':'),
        });
      }
    }
  }

  meta.adviserTimeline.sort((a, b) => a.sequence - b.sequence);
  if (!meta.decisionCode) meta.decisionCode = entry.scoring.decision || null;
  if (meta.confidence == null && entry.scoring.score != null) {
    meta.confidence = entry.scoring.score;
  }
  if (!meta.projectionVersion) {
    meta.projectionVersion = resolveProjectionVersion(meta, entry);
  }
  return meta;
}
