/**
 * Task 15.7 — Entry Quality format helpers.
 */

import type { EntryQualityDecision, EntryQualityGrade } from './EntryQualityTypes';

export function formatEntryQualityGrade(g: EntryQualityGrade): string {
  return g;
}

export function formatEntryQualityDecision(d: EntryQualityDecision): string {
  return d;
}

export function formatEntryQualityScore(n: number): string {
  return `${Math.round(n)}/100`;
}
