/**
 * V41-XRP-3 / 3c — Production safeguards for XRPUSDT Confirm-B.
 *
 * - Dedicated log channel (tag `[V41-XRP-BREAKOUT]`) so live fills are
 *   comparable to backtest expectancy (WR ~51–53%, E[R] after ~0.17–0.20).
 * - Consecutive-loss alert at ≥5 closed losses in a row:
 *     console.warn (kept) + local notification via presentLocalNotification
 *     (native) / browser Notification (web — same pattern as session check).
 * - No auto kill-switch on this path (V41 sessions do not write psychology journal).
 */

import { Platform } from 'react-native';
import {
  isNativeNotificationSupported,
  POSITION_ADVISOR_CHANNEL_ID,
  presentLocalNotification,
} from '../../localNotification';
import type { V41TriggerType } from '../rc3/rc3ViewModelTypes';

export const XRP_BREAKOUT_SYMBOL = 'XRPUSDT';
export const XRP_BREAKOUT_LOG_TAG = '[V41-XRP-BREAKOUT]';
/** Alert threshold from task brief — not auto-disable. Reviewer kept ≥5 (V41-XRP-3c). */
export const XRP_BREAKOUT_CONSECUTIVE_LOSS_ALERT = 5;

export const XRP_BREAKOUT_LOSS_STREAK_NOTIFY_TITLE =
  'V41 XRP Breakout — 5 lệnh thua liên tiếp';

const BREAKOUT_TRIGGER: V41TriggerType = 'Breakout Confirmed';

export type XrpBreakoutSessionLike = {
  id: string;
  symbol: string;
  action: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  tp: number;
  pnl: number | null;
  triggerType: V41TriggerType | null;
  openedAt: number;
};

export type XrpBreakoutNotifyFn = (options: {
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, unknown>;
}) => Promise<boolean>;

/** In-memory streak for this app process (resets on restart — intentional light touch). */
let consecutiveLosses = 0;
const closedSessionIds = new Set<string>();
/** Prevents repeat push while streak stays ≥ threshold (fires once per crossing). */
let lossStreakNotifySent = false;

/** Test override — bypass real presentLocalNotification / browser Notification. */
let notifyFnOverride: XrpBreakoutNotifyFn | null = null;

export function isXrpBreakoutProductionSession(
  session: Pick<XrpBreakoutSessionLike, 'symbol' | 'triggerType'>,
): boolean {
  return (
    session.symbol.trim().toUpperCase() === XRP_BREAKOUT_SYMBOL &&
    session.triggerType === BREAKOUT_TRIGGER
  );
}

export function getXrpBreakoutConsecutiveLosses(): number {
  return consecutiveLosses;
}

/** Test / hydrate helper — clear process-local streak + dedupe set. */
export function resetXrpBreakoutSafeguardStateForTests(): void {
  consecutiveLosses = 0;
  closedSessionIds.clear();
  lossStreakNotifySent = false;
  notifyFnOverride = null;
}

export function setXrpBreakoutNotifyFnForTests(fn: XrpBreakoutNotifyFn | null): void {
  notifyFnOverride = fn;
}

export function buildXrpBreakoutLossStreakNotifyBody(params: {
  consecutiveLosses: number;
  lastLossAtMs: number;
  sessionId: string;
}): string {
  const when = new Date(params.lastLossAtMs).toISOString();
  return (
    `Chuỗi thua liên tiếp: ${params.consecutiveLosses} ` +
    `(ngưỡng cảnh báo ${XRP_BREAKOUT_CONSECUTIVE_LOSS_ALERT}). ` +
    `Lệnh thua gần nhất: ${when} (session ${params.sessionId}). ` +
    `Không có auto-lock trên path V41. Kiểm tra lại trước khi mở thêm lệnh XRP breakout ` +
    `(đối chiếu XRP-1 OOS Q1 yếu).`
  );
}

/**
 * Deliver alert via shared local-notification infra (position-advisor channel on native).
 * Web: browser Notification when permission already granted (session toggle flow).
 */
export async function deliverXrpBreakoutLossStreakNotification(params: {
  consecutiveLosses: number;
  lastLossAtMs: number;
  sessionId: string;
}): Promise<boolean> {
  const title = XRP_BREAKOUT_LOSS_STREAK_NOTIFY_TITLE;
  const body = buildXrpBreakoutLossStreakNotifyBody(params);
  const payload = {
    title,
    body,
    channelId: POSITION_ADVISOR_CHANNEL_ID,
    data: {
      type: 'v41-xrp-breakout-loss-streak',
      symbol: XRP_BREAKOUT_SYMBOL,
      consecutiveLosses: params.consecutiveLosses,
      sessionId: params.sessionId,
    },
  };

  if (notifyFnOverride) {
    return notifyFnOverride(payload);
  }

  if (isNativeNotificationSupported()) {
    return presentLocalNotification(payload);
  }

  // Web / EXE — reuse browser Notification pattern from sessionNotification (no new pipeline).
  if (
    Platform.OS === 'web' &&
    typeof globalThis.Notification !== 'undefined' &&
    Notification.permission === 'granted'
  ) {
    try {
      const notification = new Notification(title, {
        body,
        tag: 'v41-xrp-breakout-loss-streak',
      });
      notification.onclick = () => {
        notification.close();
        if (typeof globalThis.focus === 'function') {
          globalThis.focus();
        }
      };
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function logXrpBreakoutSessionOpened(session: XrpBreakoutSessionLike): void {
  if (!isXrpBreakoutProductionSession(session)) return;
  console.info(
    `${XRP_BREAKOUT_LOG_TAG} OPEN`,
    JSON.stringify({
      sessionId: session.id,
      symbol: session.symbol,
      side: session.action,
      entry: session.entry,
      stop: session.stop,
      tp1: session.tp,
      triggerType: session.triggerType,
      openedAt: session.openedAt,
      expectHint: { wrPctApprox: '51-53', erAfterFeeApprox: '0.17-0.20' },
    }),
  );
}

/**
 * Log close + update consecutive-loss streak.
 * Idempotent per session id (endSession may race with adviser Close patches).
 */
export function logXrpBreakoutSessionClosed(session: XrpBreakoutSessionLike): void {
  if (!isXrpBreakoutProductionSession(session)) return;
  if (closedSessionIds.has(session.id)) return;
  closedSessionIds.add(session.id);

  const pnl = session.pnl;
  const outcome =
    pnl == null || !Number.isFinite(pnl) ? 'UNKNOWN' : pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'FLAT';

  if (outcome === 'LOSS') {
    consecutiveLosses += 1;
  } else if (outcome === 'WIN') {
    consecutiveLosses = 0;
    lossStreakNotifySent = false;
  }
  // UNKNOWN / FLAT: do not reset or increment (ambiguous live close).

  console.info(
    `${XRP_BREAKOUT_LOG_TAG} CLOSE`,
    JSON.stringify({
      sessionId: session.id,
      symbol: session.symbol,
      side: session.action,
      pnl,
      outcome,
      consecutiveLosses,
    }),
  );

  if (consecutiveLosses >= XRP_BREAKOUT_CONSECUTIVE_LOSS_ALERT) {
    console.warn(
      `${XRP_BREAKOUT_LOG_TAG} ALERT consecutive_losses=${consecutiveLosses} ` +
        `(threshold=${XRP_BREAKOUT_CONSECUTIVE_LOSS_ALERT}). ` +
        `Baseline WR~52% ⇒ P(≥5 losses)≈2.5%. Review live vs XRP-1 OOS; no auto kill-switch.`,
    );

    // Notify once per streak (on first crossing), not on every extra loss.
    if (!lossStreakNotifySent) {
      lossStreakNotifySent = true;
      const lastLossAtMs = Date.now();
      void deliverXrpBreakoutLossStreakNotification({
        consecutiveLosses,
        lastLossAtMs,
        sessionId: session.id,
      }).catch((err) => {
        console.warn(`${XRP_BREAKOUT_LOG_TAG} notify failed:`, err);
      });
    }
  }
}
