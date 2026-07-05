import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import type { StructureSLResult } from '../../services/structureSL';

interface StructureSLSectionProps {
  structureSL: StructureSLResult;
}

type BadgeKind = 'wider' | 'tighter' | 'fallback';

function formatPrice(value: number): string {
  return value.toFixed(4);
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function computeStructureSlPrice(result: StructureSLResult): number {
  const isLong = result.slPrice <= result.swingPrice || result.swingPrice <= 0;
  if (isLong) {
    return result.swingPrice * (1 - result.bufferPct / 100);
  }
  return result.swingPrice * (1 + result.bufferPct / 100);
}

function resolveAtrSlPrice(result: StructureSLResult): number | null {
  if (result.slSource === 'ATR_FALLBACK') return result.slPrice;
  const structurePrice = computeStructureSlPrice(result);
  if (Math.abs(result.slPrice - structurePrice) > 1e-6 * Math.max(result.slPrice, 1)) {
    return result.slPrice;
  }
  return null;
}

function resolveBadgeKind(result: StructureSLResult): BadgeKind {
  if (result.slSource === 'ATR_FALLBACK') return 'fallback';
  const structurePrice = computeStructureSlPrice(result);
  if (Math.abs(result.slPrice - structurePrice) <= 1e-6 * Math.max(result.slPrice, 1)) {
    return 'wider';
  }
  return 'tighter';
}

const BADGE_STYLES: Record<
  BadgeKind,
  { badgeBg: string; badgeColor: string; borderColor: string }
> = {
  wider: {
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  tighter: {
    badgeBg: 'rgba(34, 197, 94, 0.2)',
    badgeColor: '#22C55E',
    borderColor: '#22C55E',
  },
  fallback: {
    badgeBg: 'rgba(148, 163, 184, 0.15)',
    badgeColor: '#94A3B8',
    borderColor: '#94A3B8',
  },
};

function MetricRow({
  label,
  value,
  subValue,
  valueStyle,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.colMetric, styles.metricLabel]}>{label}</Text>
      <View style={[styles.tableCell, styles.colValueWrap]}>
        <Text style={[styles.colValue, styles.metricValue, valueStyle]}>{value}</Text>
        {subValue ? <Text style={styles.metricSub}>{subValue}</Text> : null}
      </View>
    </View>
  );
}

export function StructureSLSection({ structureSL }: StructureSLSectionProps) {
  const copy = vi.signalBoard.structureSL;
  const badgeKind = resolveBadgeKind(structureSL);
  const badgeStyle = BADGE_STYLES[badgeKind];
  const badgeCopy = copy.badges[badgeKind];
  const isStructure = structureSL.slSource === 'STRUCTURE';
  const structurePrice = isStructure ? computeStructureSlPrice(structureSL) : null;
  const atrSlPrice = resolveAtrSlPrice(structureSL);

  const badgeLabel =
    badgeKind === 'wider'
      ? copy.badgeWider
      : badgeKind === 'tighter'
        ? copy.badgeTighter
        : copy.badgeFallback;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>{copy.title}</Text>
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

        {isStructure ? (
          <>
            <MetricRow
              label={copy.swingPoint}
              value={formatPrice(structureSL.swingPrice)}
              subValue={`(${structureSL.candlesBack} ${copy.candlesBack})`}
            />
            <MetricRow
              label={copy.buffer}
              value={formatPct(structureSL.bufferPct)}
            />
            <MetricRow
              label={copy.structureSLPrice}
              value={formatPrice(structurePrice ?? structureSL.slPrice)}
            />
            <MetricRow
              label={copy.atrSLPrice}
              value={atrSlPrice != null ? formatPrice(atrSlPrice) : copy.atrUnavailable}
            />
            <MetricRow
              label={copy.appliedSL}
              value={formatPrice(structureSL.slPrice)}
              valueStyle={styles.appliedValue}
            />
            <MetricRow
              label={copy.distance}
              value={formatPct(structureSL.distanceFromEntry)}
            />
          </>
        ) : (
          <>
            <MetricRow
              label={copy.statusLabel}
              value={copy.sourceFallback}
              subValue={copy.fallbackNote}
            />
            <MetricRow
              label={copy.appliedSL}
              value={`${formatPrice(structureSL.slPrice)} (${copy.atrTag})`}
            />
          </>
        )}
      </View>

      <View
        style={[
          styles.badgeCard,
          {
            backgroundColor: badgeStyle.badgeBg,
            borderColor: badgeStyle.borderColor,
          },
        ]}
      >
        <Text style={[styles.badgeLabel, { color: badgeStyle.badgeColor }]}>{badgeLabel}</Text>
        <Text style={styles.badgeDesc}>{badgeCopy.description}</Text>
      </View>
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
  colValueWrap: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  colValue: {
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
  metricSub: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  appliedValue: {
    color: '#22C55E',
    fontWeight: '800',
  },
  badgeCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.xs,
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
});
