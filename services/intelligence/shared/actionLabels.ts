/**
 * Task 14.4.1 — Shared action labels (TI View tags).
 * Used by Journal Timeline + Statistics — no reverse layer imports.
 */

const ACTION_LABELS: Record<string, string> = {
  WAITING_FILL: 'Waiting Fill',
  HOLD: 'Hold',
  MOVE_SL_BE: 'Move SL',
  TRAILING_STOP: 'Move SL',
  PARTIAL_TP1: 'Scale Out',
  PARTIAL_TP2: 'Scale Out',
  CLOSE_NOW: 'Close',
};

export function actionCodeToLabel(code: string): string {
  return ACTION_LABELS[code] ?? code;
}
