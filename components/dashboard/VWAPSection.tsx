import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import type { VWAPBonusResult } from '../../services/vwapBonus';
import type { VWAPEntrySignal, VWAPResult, VWAPZone } from '../../services/vwapService';

interface VWAPSectionProps {
  vwapData: VWAPResult;
  currentPrice: number;
  vwapSignal?: VWAPEntrySignal;
  vwapBonus?: VWAPBonusResult;
}

type ZoneKey = VWAPZone;
type QualityKey = 'IDEAL' | 'GOOD' | 'POOR';

function formatPrice(value: number): string {
  return value.toFixed(4);
}

function formatPriceVsVwap(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

const ZONE_STYLES: Record<
  ZoneKey,
  { badgeBg: string; badgeColor: string; borderColor: string }
> = {
  ABOVE_BAND2: {
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    badgeColor: '#EF4444',
    borderColor: '#EF4444',
  },
  ABOVE_BAND1: {
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  NEAR_VWAP: {
    badgeBg: 'rgba(34, 197, 94, 0.2)',
    badgeColor: '#22C55E',
    borderColor: '#22C55E',
  },
  BELOW_BAND1: {
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  BELOW_BAND2: {
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    badgeColor: '#EF4444',
    borderColor: '#EF4444',
  },
  BETWEEN: {
    badgeBg: 'rgba(148, 163, 184, 0.15)',
    badgeColor: '#94A3B8',
    borderColor: '#94A3B8',
  },
};

const QUALITY_STYLES: Record<
  QualityKey,
  { badgeBg: string; badgeColor: string; borderColor: string }
> = {
  IDEAL: {
    badgeBg: 'rgba(22, 163, 74, 0.2)',
    badgeColor: '#16A34A',
    borderColor: '#16A34A',
  },
  GOOD: {
    badgeBg: 'rgba(134, 239, 172, 0.25)',
    badgeColor: '#4ADE80',
    borderColor: '#4ADE80',
  },
  POOR: {
    badgeBg: 'rgba(148, 163, 184, 0.15)',
    badgeColor: '#94A3B8',
    borderColor: '#94A3B8',
  },
};

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.colMetric, styles.metricLabel]}>{label}</Text>
      <Text style={[styles.tableCell, styles.colValue, styles.metricValue]}>{value}</Text>
    </View>
  );
}

export function VWAPSection({
  vwapData,
  currentPrice,
  vwapSignal,
  vwapBonus,
}: VWAPSectionProps) {
  const copy = vi.signalBoard.vwap;
  const zoneKey = vwapData.zone;
  const zoneStyle = ZONE_STYLES[zoneKey];
  const zoneCopy = copy.zoneDetails[zoneKey];

  const quality = vwapSignal?.quality;
  const showEntrySignal =
    quality != null && quality !== 'NEUTRAL' && (quality === 'IDEAL' || quality === 'GOOD' || quality === 'POOR');
  const qualityCopy =
    showEntrySignal && quality ? copy.qualityDetails[quality as QualityKey] : null;
  const qualityStyle =
    showEntrySignal && quality ? QUALITY_STYLES[quality as QualityKey] : null;

  const metrics = [
    { label: copy.vwapPrice, value: formatPrice(vwapData.vwap) },
    { label: copy.upperBand2, value: formatPrice(vwapData.upperBand2) },
    { label: copy.upperBand1, value: formatPrice(vwapData.upperBand1) },
    { label: copy.currentPrice, value: formatPrice(currentPrice) },
    { label: copy.lowerBand1, value: formatPrice(vwapData.lowerBand1) },
    { label: copy.lowerBand2, value: formatPrice(vwapData.lowerBand2) },
    { label: copy.priceVsVwap, value: formatPriceVsVwap(vwapData.priceVsVwap) },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>📊 {copy.title}</Text>
      </View>
      <Text style={styles.hint}>{copy.tooltip}</Text>

      <Text style={styles.subheading}>{copy.metricsHeader}</Text>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeadRow]}>
          <Text style={[styles.tableCell, styles.tableHead, styles.colMetric]}>
            {copy.colMetric}
          </Text>
          <Text style={[styles.tableCell, styles.tableHead, styles.colValueHead]}>
            {copy.colValue}
          </Text>
        </View>
        {metrics.map((row) => (
          <MetricRow key={row.label} label={row.label} value={row.value} />
        ))}
      </View>

      <Text style={styles.subheading}>{copy.zone}</Text>
      <View
        style={[
          styles.badgeCard,
          {
            backgroundColor: zoneStyle.badgeBg,
            borderColor: zoneStyle.borderColor,
          },
        ]}
      >
        <Text style={[styles.badgeLabel, { color: zoneStyle.badgeColor }]}>
          {zoneCopy.badge}
        </Text>
        <Text style={styles.badgeDesc}>{zoneCopy.description}</Text>
      </View>

      {showEntrySignal && qualityCopy && qualityStyle ? (
        <>
          <Text style={styles.subheading}>{copy.entrySignal}</Text>
          <View
            style={[
              styles.badgeCard,
              {
                backgroundColor: qualityStyle.badgeBg,
                borderColor: qualityStyle.borderColor,
              },
            ]}
          >
            <Text style={[styles.badgeLabel, { color: qualityStyle.badgeColor }]}>
              {qualityCopy.badge}
            </Text>
            <Text style={styles.badgeDesc}>{qualityCopy.description}</Text>
            {vwapSignal?.suggestedEntry != null ? (
              <Text style={styles.suggestedEntry}>
                {qualityCopy.suggestedLabel(formatPrice(vwapSignal.suggestedEntry))}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {vwapBonus?.applied ? (
        <View style={styles.bonusBadge}>
          <Text style={styles.bonusText}>{copy.bonusLabel}</Text>
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
    flex: 1.4,
  },
  colValueHead: {
    flex: 1,
    textAlign: 'right',
  },
  colValue: {
    flex: 1,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  metricValue: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  badgeCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  suggestedEntry: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
    marginTop: 2,
  },
  bonusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  bonusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
  },
});
