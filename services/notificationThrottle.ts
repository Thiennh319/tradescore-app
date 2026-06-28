import type { PositionRecommendation } from './positionAdvisorV3';

export type NotificationUrgency = PositionRecommendation['urgency'];

export interface NotificationThrottleEntry {
  lastNotifiedUrgency: NotificationUrgency;
  lastNotifiedAt: number;
}

export type NotificationThrottleState = Record<string, NotificationThrottleEntry>;

export const URGENCY_RANK: Record<NotificationUrgency, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const MIN_REPEAT_INTERVAL_MS = 5 * 60_000;

export function shouldNotifyForUrgency(
  throttle: NotificationThrottleEntry | undefined,
  newUrgency: NotificationUrgency,
  now = Date.now(),
): boolean {
  if (!throttle) {
    return URGENCY_RANK[newUrgency] >= URGENCY_RANK.MEDIUM;
  }

  const timeSinceLastMs = now - throttle.lastNotifiedAt;
  const urgencyIncreased =
    URGENCY_RANK[newUrgency] > URGENCY_RANK[throttle.lastNotifiedUrgency];
  const criticalRepeat =
    newUrgency === 'CRITICAL' && timeSinceLastMs >= MIN_REPEAT_INTERVAL_MS;

  return urgencyIncreased || criticalRepeat;
}
