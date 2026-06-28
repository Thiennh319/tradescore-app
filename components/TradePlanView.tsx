import { useCallback, useState } from 'react';
import { Clipboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COLORS,
  type AppTradeSymbol,
  type TradeDirection,
  type TradePlan,
} from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import type { EntryZoneType } from '../services/indicators';
import { formatUsdPrice } from '../utils/formatPrice';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface TradePlanViewProps {
  symbol: AppTradeSymbol;
  direction: TradeDirection;
  plan: TradePlan;
}

async function copyPrice(text: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  }
  Clipboard.setString(text);
}

function entryZoneTypeLabel(type: EntryZoneType): string {
  return vi.recommend.entryZoneTypes[type] ?? type;
}

function PriceCopyRow({
  label,
  value,
  symbol,
  color = COLORS.textPrimary,
  suffix,
}: {
  label: string;
  value: number;
  symbol: AppTradeSymbol;
  color?: string;
  suffix?: string;
}) {
  const [copied, setCopied] = useState(false);
  const formatted = formatUsdPrice(symbol, value);

  const onCopy = useCallback(async () => {
    await copyPrice(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <View style={styles.priceRow}>
      <Text style={styles.priceLabel}>{label}</Text>
      <View style={styles.priceValueWrap}>
        <Text style={[styles.priceValue, { color }]}>
          {formatted}
          {suffix ? ` ${suffix}` : ''}
        </Text>
        <Pressable onPress={() => void onCopy()} style={[styles.copyBtn, webPointer]}>
          <Text style={styles.copyBtnText}>{copied ? '✓' : vi.recommend.copy}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Hiển thị vùng entry + SL/TP với nút copy. */
export function TradePlanView({ symbol, direction, plan }: TradePlanViewProps) {
  const zone = plan.entryZone;
  const isLong = direction === 'LONG';

  const showFarWarning =
    zone?.type === 'PULLBACK_EMA' &&
    ((isLong && zone.distanceFromCurrentPct < -1) ||
      (!isLong && zone.distanceFromCurrentPct > 1));

  if (!zone) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{vi.recommend.entryZoneTitle}</Text>

      <View style={styles.metaBlock}>
        <Text style={styles.metaLine}>
          {vi.recommend.entryZoneType}: {entryZoneTypeLabel(zone.type)}
        </Text>
        <PriceCopyRow
          label={vi.recommend.entryZoneLimit}
          value={zone.optimal}
          symbol={symbol}
          suffix={`(${zone.distanceFromCurrentPct >= 0 ? '+' : ''}${zone.distanceFromCurrentPct.toFixed(2)}%)`}
        />
        <Text style={styles.rangeLine}>
          {vi.recommend.entryZoneRange}: {formatUsdPrice(symbol, zone.rangeLow)} —{' '}
          {formatUsdPrice(symbol, zone.rangeHigh)}
        </Text>
        <Text style={styles.reason}>💡 {zone.reasoning}</Text>
        {showFarWarning ? (
          <Text style={styles.warning}>{vi.recommend.entryZoneFarWarning}</Text>
        ) : null}
      </View>

      <View style={styles.divider} />

      <PriceCopyRow label={vi.recommend.sl} value={plan.stopLoss} symbol={symbol} color={COLORS.bearish} />
      <PriceCopyRow
        label={`${vi.recommend.tp(1)} (50%)`}
        value={plan.takeProfit1}
        symbol={symbol}
        color={COLORS.bullish}
      />
      <PriceCopyRow label={vi.recommend.tp(2)} value={plan.takeProfit2} symbol={symbol} color={COLORS.bullish} />
      <PriceCopyRow label={vi.recommend.tp(3)} value={plan.takeProfit3} symbol={symbol} color={COLORS.bullish} />

      <Text style={styles.rrLine}>
        {vi.recommend.rrLabel}: {plan.rrRatio != null ? `${plan.rrRatio.toFixed(1)}:1` : '—'}
        {plan.isSafeSL ? ' ✅' : ''}
      </Text>
      {plan.isSafeSL && plan.safeSLReason ? (
        <Text style={styles.safeSl}>{plan.safeSLReason}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
    gap: SPACING.sm,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  metaBlock: {
    gap: 6,
  },
  metaLine: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  rangeLine: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  reason: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  warning: {
    fontSize: 10,
    color: COLORS.warning,
    fontWeight: '700',
    lineHeight: 14,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    flex: 1,
  },
  priceValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  priceValue: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  copyBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
  },
  rrLine: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  safeSl: {
    fontSize: 10,
    color: COLORS.bullish,
    lineHeight: 14,
  },
});
