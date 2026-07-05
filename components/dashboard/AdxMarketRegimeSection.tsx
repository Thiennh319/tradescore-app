import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import type { ADXGateResult } from '../../services/adxGate';
import type { ADXAnalysis } from '../../services/indicators';

type RegimeKey = 'CHOPPY' | 'RANGING' | 'TRENDING_WEAK' | 'TRENDING_STRONG';

interface AdxMarketRegimeSectionProps {
  adxData: ADXAnalysis;
  adxGate?: ADXGateResult;
}

function formatAdx(value: number): string {
  return value.toFixed(1);
}

function formatMultiplier(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function resolveRegimeKey(adxData: ADXAnalysis): RegimeKey {
  if (adxData.regime === 'CHOPPY') return 'CHOPPY';
  if (adxData.regime === 'RANGING') return 'RANGING';
  if (adxData.regime === 'TRENDING' && adxData.regimeStrength === 'STRONG') {
    return 'TRENDING_STRONG';
  }
  return 'TRENDING_WEAK';
}

const REGIME_STYLES: Record<
  RegimeKey,
  { badgeBg: string; badgeColor: string; borderColor: string }
> = {
  CHOPPY: {
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    badgeColor: '#EF4444',
    borderColor: '#EF4444',
  },
  RANGING: {
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  TRENDING_WEAK: {
    badgeBg: 'rgba(134, 239, 172, 0.2)',
    badgeColor: '#86EFAC',
    borderColor: '#86EFAC',
  },
  TRENDING_STRONG: {
    badgeBg: 'rgba(34, 197, 94, 0.2)',
    badgeColor: '#22C55E',
    borderColor: '#22C55E',
  },
};

export function AdxMarketRegimeSection({ adxData, adxGate }: AdxMarketRegimeSectionProps) {
  const regimeKey = resolveRegimeKey(adxData);
  const regimeCopy = vi.signalBoard.adx.regimes[regimeKey];
  const regimeStyle = REGIME_STYLES[regimeKey];
  const showPlanAdjust = adxGate != null && adxGate.tpMultiplier !== 1.0;
  const isStrongAdjust =
    regimeKey === 'TRENDING_STRONG' || adxGate?.severity === 'BONUS';

  const metrics = [
    {
      label: vi.signalBoard.adx.adx1h,
      value: formatAdx(adxData.adx1H),
      meaning: vi.signalBoard.adx.meaning1h,
    },
    {
      label: vi.signalBoard.adx.adx4h,
      value: formatAdx(adxData.adx4H),
      meaning: vi.signalBoard.adx.meaning4h,
    },
    {
      label: vi.signalBoard.adx.adxAvg,
      value: formatAdx(adxData.adxAvg),
      meaning: vi.signalBoard.adx.meaningAvg,
    },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>{vi.signalBoard.adx.sectionTitle}</Text>
      </View>
      <Text style={styles.hint}>{vi.signalBoard.adx.hint}</Text>

      <Text style={styles.subheading}>{vi.signalBoard.adx.metricsHeader}</Text>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeadRow]}>
          <Text style={[styles.tableCell, styles.tableHead, styles.colMetric]}>
            {vi.signalBoard.adx.colMetric}
          </Text>
          <Text style={[styles.tableCell, styles.tableHead, styles.colValue]}>
            {vi.signalBoard.adx.colValue}
          </Text>
          <Text style={[styles.tableCell, styles.tableHead, styles.colMeaning]}>
            {vi.signalBoard.adx.colMeaning}
          </Text>
        </View>
        {metrics.map((row) => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.colMetric, styles.metricLabel]}>{row.label}</Text>
            <Text style={[styles.tableCell, styles.colValue, styles.metricValue]}>{row.value}</Text>
            <Text style={[styles.tableCell, styles.colMeaning, styles.metricMeaning]}>{row.meaning}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.subheading}>{vi.signalBoard.adx.regimeHeader}</Text>
      <View
        style={[
          styles.regimeCard,
          {
            backgroundColor: regimeStyle.badgeBg,
            borderColor: regimeStyle.borderColor,
          },
        ]}
      >
        <Text style={[styles.regimeBadge, { color: regimeStyle.badgeColor }]}>
          {regimeCopy.badge}
        </Text>
        <Text style={styles.regimeDesc}>{regimeCopy.description}</Text>
        <Text style={[styles.regimeAction, { color: regimeStyle.badgeColor }]}>
          {regimeCopy.action}
        </Text>
      </View>

      {showPlanAdjust && adxGate ? (
        <View style={styles.adjustBox}>
          <Text style={styles.adjustTitle}>{vi.signalBoard.adx.planAdjustTitle}</Text>
          {isStrongAdjust ? (
            <>
              <Text style={styles.adjustLine}>
                {vi.signalBoard.adx.strongTpLine(formatMultiplier(adxGate.tpMultiplier))}
              </Text>
              <Text style={styles.adjustLine}>
                {vi.signalBoard.adx.strongSlLine(formatMultiplier(adxGate.slMultiplier))}
              </Text>
              <Text style={styles.adjustReason}>{vi.signalBoard.adx.strongReason}</Text>
            </>
          ) : (
            <>
              <Text style={styles.adjustLine}>
                {vi.signalBoard.adx.weakTpLine(formatMultiplier(adxGate.tpMultiplier))}
              </Text>
              <Text style={styles.adjustLine}>
                {vi.signalBoard.adx.weakSlLine(formatMultiplier(adxGate.slMultiplier))}
              </Text>
              <Text style={styles.adjustReason}>{vi.signalBoard.adx.weakReason}</Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  hint: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  subheading: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.xs,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeadRow: {
    backgroundColor: COLORS.surfaceElevated,
  },
  tableCell: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 10,
  },
  tableHead: {
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  colMetric: {
    flex: 1.1,
  },
  colValue: {
    width: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  colMeaning: {
    flex: 2,
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  metricValue: {
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  metricMeaning: {
    color: COLORS.textMuted,
    lineHeight: 13,
  },
  regimeCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  regimeBadge: {
    fontSize: 14,
    fontWeight: '800',
  },
  regimeDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  regimeAction: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  adjustBox: {
    marginTop: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  adjustTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  adjustLine: {
    fontSize: 11,
    color: COLORS.textPrimary,
    lineHeight: 16,
  },
  adjustReason: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
