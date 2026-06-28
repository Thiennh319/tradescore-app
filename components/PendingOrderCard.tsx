import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, type AppTradeSymbol } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import { formatLockedPlanCountdown } from '../services/journalService';
import { formatPlanHealthBadge } from '../services/planHealth';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import type { PlanHealth } from '../types/tradePlan';
import { formatUsdPrice, formatUsdt } from '../utils/formatPrice';
import { pendingEntryDistancePercent } from '../utils/pendingOrderFill';

interface PendingOrderCardProps {
  entry: StoredTradeJournalEntry;
  markPrice?: number | null;
  expiresAt?: number;
  lockedScore?: number;
  expiryHours?: number;
  planHealth?: PlanHealth | null;
  cancelWarning?: { message: string };
  onConfirmFill?: () => void;
  onCancel?: () => void;
  /** Gọi một lần khi expiresAt đã qua — kích hoạt checkPlanExpiry / unlock. */
  onPlanExpired?: () => void;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

/** Khối lệnh chờ limit trên thẻ coin — gồm đếm tự hủy khi có locked plan. */
export function PendingOrderCard({
  entry,
  markPrice,
  expiresAt,
  lockedScore,
  expiryHours,
  planHealth,
  cancelWarning,
  onConfirmFill,
  onCancel,
  onPlanExpired,
}: PendingOrderCardProps) {
  const symbol = entry.symbol as AppTradeSymbol;
  const isLong = entry.direction === 'LONG';
  const dirColor = isLong ? COLORS.bullish : COLORS.bearish;
  const dist =
    markPrice != null
      ? pendingEntryDistancePercent(entry.direction, markPrice, entry.entryPrice)
      : null;
  const notional =
    entry.size > 0 && entry.leverage > 0 ? entry.size * entry.leverage : null;

  const [countdown, setCountdown] = useState(() =>
    expiresAt != null ? formatLockedPlanCountdown(expiresAt) : '',
  );
  const expiredFiredRef = useRef(false);

  useEffect(() => {
    if (expiresAt == null) {
      setCountdown('');
      expiredFiredRef.current = false;
      return;
    }
    expiredFiredRef.current = false;

    const tick = () => {
      const now = Date.now();
      if (now >= expiresAt) {
        setCountdown('');
        if (!expiredFiredRef.current) {
          expiredFiredRef.current = true;
          onPlanExpired?.();
        }
        return;
      }
      setCountdown(formatLockedPlanCountdown(expiresAt, now));
    };

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [expiresAt, onPlanExpired]);

  return (
    <View style={[styles.wrap, cancelWarning ? styles.wrapWarn : null]}>
      <View style={styles.headRow}>
        <Text style={styles.headLabel}>{vi.pendingOrder.title}</Text>
        <View style={[styles.dirBadge, { backgroundColor: `${dirColor}22`, borderColor: dirColor }]}>
          <Text style={[styles.dirText, { color: dirColor }]}>
            {isLong ? vi.activePosition.long : vi.activePosition.short} · {entry.leverage}x
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <Metric label={vi.pendingOrder.limitEntry} value={formatUsdPrice(symbol, entry.entryPrice)} />
        <Metric
          label={vi.signalBoard.markPrice}
          value={markPrice != null ? formatUsdPrice(symbol, markPrice) : '—'}
        />
        <Metric
          label={vi.pendingOrder.distance}
          value={
            dist != null
              ? dist <= 0
                ? vi.pendingOrder.nearFill
                : `${dist.toFixed(2)}%`
              : '—'
          }
          highlight={dist != null && dist <= 0.15}
        />
        <Metric
          label={vi.activePosition.stopLoss}
          value={entry.stopLoss != null ? formatUsdPrice(symbol, entry.stopLoss) : '—'}
        />
        <Metric
          label={vi.signalBoard.margin}
          value={entry.size > 0 ? `$${formatUsdt(entry.size)}` : '—'}
        />
        <Metric
          label={vi.signalBoard.notional}
          value={notional != null ? `$${formatUsdt(notional)}` : '—'}
        />
      </View>

      {expiresAt != null ? (
        countdown ? (
          <Text style={styles.countdown}>
            {lockedScore != null && expiryHours != null
              ? vi.pendingOrder.autoCancelWithPlan(countdown, lockedScore, expiryHours)
              : vi.pendingOrder.autoCancel(countdown)}
          </Text>
        ) : (
          <Text style={styles.expiring}>{vi.pendingOrder.expiring}</Text>
        )
      ) : null}

      {planHealth ? <PlanHealthBadge planHealth={planHealth} /> : null}

      {cancelWarning ? (
        <View style={styles.cancelBox}>
          <Text style={styles.cancelWarnText}>⚠️ {cancelWarning.message}</Text>
        </View>
      ) : null}

      {onConfirmFill && onCancel ? (
        <View style={styles.actions}>
          <Pressable onPress={onConfirmFill} style={[styles.btnFill, webPointer]}>
            <Text style={styles.btnFillText}>{vi.pendingOrder.confirmFill}</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={[styles.btnCancel, webPointer]}>
            <Text style={styles.btnCancelText}>{vi.pendingOrder.cancelLocked}</Text>
          </Pressable>
        </View>
      ) : onCancel ? (
        <Pressable onPress={onCancel} style={[styles.cancelBtn, webPointer]}>
          <Text style={styles.cancelText}>{vi.pendingOrder.cancel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PlanHealthBadge({ planHealth }: { planHealth: PlanHealth }) {
  const badgeText = formatPlanHealthBadge(planHealth);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (planHealth.status !== 'CRITICAL') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [planHealth.status, pulse]);

  if (!badgeText) return null;

  const tone =
    planHealth.status === 'NORMAL'
      ? styles.healthNormal
      : planHealth.status === 'WEAK'
        ? styles.healthWeak
        : planHealth.status === 'CRITICAL'
          ? styles.healthCritical
          : null;

  const content = (
    <Text style={[styles.healthText, tone && { color: tone.color }]}>{badgeText}</Text>
  );

  if (planHealth.status === 'CRITICAL') {
    return (
      <Animated.View style={[styles.healthBadge, tone, { opacity: pulse }]}>
        {content}
      </Animated.View>
    );
  }

  return <View style={[styles.healthBadge, tone]}>{content}</View>;
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.metric, highlight && styles.metricHighlight]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, highlight && { color: COLORS.accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.06)',
    padding: SPACING.sm,
    gap: SPACING.sm,
    marginTop: 2,
  },
  wrapWarn: {
    borderColor: COLORS.warning,
    backgroundColor: 'rgba(255, 193, 7, 0.08)',
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dirBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  dirText: {
    fontSize: 10,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  metric: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    gap: 2,
  },
  metricHighlight: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  countdown: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
    textAlign: 'center',
  },
  expiring: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.warning,
    textAlign: 'center',
  },
  healthBadge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    alignItems: 'center',
  },
  healthText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 14,
  },
  healthNormal: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    color: '#22C55E',
  },
  healthWeak: {
    backgroundColor: 'rgba(255, 193, 7, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.warning,
    color: COLORS.warning,
  },
  healthCritical: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.bearish,
    color: COLORS.bearish,
  },
  cancelBox: {
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderRadius: RADIUS.sm,
    padding: SPACING.xs,
  },
  cancelWarnText: {
    fontSize: 10,
    color: COLORS.bearish,
    lineHeight: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  btnFill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bullish,
    alignItems: 'center',
  },
  btnFillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255, 82, 82, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.bearish,
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.bearish,
  },
  cancelBtn: {
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
});
