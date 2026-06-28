import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SCORE_THRESHOLDS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { formatScoreBiasVi, vi } from '../../constants/vi';
import type { ScoreBias } from '../../services/scorer';

const ZONES = [
  { key: 'SS' as const, end: SCORE_THRESHOLDS.strongShort, color: COLORS.bearishMuted },
  { key: 'S' as const, end: SCORE_THRESHOLDS.short, color: COLORS.bearish },
  { key: 'N' as const, end: SCORE_THRESHOLDS.neutralLow, color: COLORS.textMuted },
  { key: 'N2' as const, end: SCORE_THRESHOLDS.neutralHigh, color: COLORS.neutral },
  { key: 'L' as const, end: SCORE_THRESHOLDS.long, color: COLORS.bullishMuted },
  { key: 'SL' as const, end: 100, color: COLORS.bullish },
];

interface ScoreSpectrumProps {
  currentScore?: number | null;
  bias?: ScoreBias | null;
}

export function ScoreSpectrum({ currentScore, bias }: ScoreSpectrumProps) {
  const markerLeft =
    currentScore != null ? `${Math.max(0, Math.min(100, currentScore))}%` : null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{vi.spectrum.title}</Text>
        <Text style={styles.caption}>{vi.spectrum.caption}</Text>
        {currentScore != null ? (
          <View style={styles.liveScoreRow}>
            <Text style={styles.liveScoreLabel}>{vi.ai.currentOnSpectrum}</Text>
            <Text style={styles.liveScoreValue}>{currentScore.toFixed(1)}</Text>
            {bias ? (
              <Text style={styles.liveBias}>{formatScoreBiasVi(bias)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.trackWrap}>
        <View style={styles.track}>
          {ZONES.map((zone, i) => (
            <View
              key={zone.key}
              style={[
                styles.segment,
                {
                  flex: zone.end - (i === 0 ? 0 : ZONES[i - 1].end),
                  backgroundColor: zone.color,
                  opacity: i === 2 || i === 3 ? 0.45 : 0.85,
                },
              ]}
            />
          ))}
        </View>
        {markerLeft ? (
          <View style={[styles.marker, { left: markerLeft }]}>
            <View style={styles.markerDot} />
            <View style={styles.markerLine} />
          </View>
        ) : null}
      </View>

      <View style={styles.zoneLabels}>
        {ZONES.filter((z) => z.key !== 'N2').map((zone) => {
          const labelKey = zone.key === 'N' ? 'N' : zone.key;
          return (
            <View key={zone.key} style={styles.zoneItem}>
              <Text style={styles.zoneKey}>{labelKey}</Text>
              <Text style={styles.zoneName}>
                {vi.spectrum.zones[labelKey as keyof typeof vi.spectrum.zones]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.scale}>
        <Text style={styles.tick}>0</Text>
        <Text style={styles.tick}>{SCORE_THRESHOLDS.strongShort}</Text>
        <Text style={styles.tick}>{SCORE_THRESHOLDS.short}</Text>
        <Text style={styles.tick}>{SCORE_THRESHOLDS.neutralLow}</Text>
        <Text style={styles.tick}>{SCORE_THRESHOLDS.neutralHigh}</Text>
        <Text style={styles.tick}>{SCORE_THRESHOLDS.long}</Text>
        <Text style={styles.tick}>{SCORE_THRESHOLDS.strongLong}</Text>
        <Text style={styles.tick}>100</Text>
      </View>

      <View style={styles.legend}>
        <LegendDot color={COLORS.bearish} label={vi.spectrum.shortBias} />
        <LegendDot color={COLORS.neutral} label={vi.spectrum.neutral} />
        <LegendDot color={COLORS.bullish} label={vi.spectrum.longBias} />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.md + 2,
    gap: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.2,
  },
  caption: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
  },
  liveScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  liveScoreLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  liveScoreValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'],
  },
  liveBias: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  trackWrap: {
    position: 'relative',
    height: 18,
    justifyContent: 'center',
  },
  track: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    alignItems: 'center',
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
  },
  markerLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.accent,
    marginTop: -1,
  },
  zoneLabels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm + 2,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  zoneKey: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  zoneName: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
  scale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tick: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.lg,
    marginTop: SPACING.md + 2,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
});
