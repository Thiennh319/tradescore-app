/**
 * V4.1 Foundation — human-readable strength band + numeric score.
 */

export const V41_STRENGTH_BAND = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME',
} as const;

export type V41StrengthBand = (typeof V41_STRENGTH_BAND)[keyof typeof V41_STRENGTH_BAND];

function clamp0100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Map 0–100 score → readable strength band. */
export function resolveStrengthBand(score: number): V41StrengthBand {
  const s = clamp0100(score);
  if (s >= 80) return V41_STRENGTH_BAND.EXTREME;
  if (s >= 60) return V41_STRENGTH_BAND.HIGH;
  if (s >= 35) return V41_STRENGTH_BAND.MEDIUM;
  return V41_STRENGTH_BAND.LOW;
}

export function resolveStrengthScore(band: V41StrengthBand): number {
  switch (band) {
    case V41_STRENGTH_BAND.EXTREME:
      return 90;
    case V41_STRENGTH_BAND.HIGH:
      return 70;
    case V41_STRENGTH_BAND.MEDIUM:
      return 50;
    default:
      return 20;
  }
}

export function normalizeStrength(score: number): {
  strength: number;
  strengthBand: V41StrengthBand;
} {
  const strength = clamp0100(score);
  return { strength, strengthBand: resolveStrengthBand(strength) };
}
