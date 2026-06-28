import { StyleSheet, Text, View } from 'react-native';
import { COLORS, getFundingStateLabel, type TradeDirection } from '../constants/scoring';
import { vi } from '../constants/vi';
import type { L6DetailV4 } from '../services/scorerV4';

export interface L6LayerExpandV4Props {
  detail: L6DetailV4;
  longScore: number;
  shortScore: number;
  /** Chiều đang xét — tô màu velocity */
  activeDirection?: TradeDirection;
}

function velocityArrow(velocity: number): string {
  if (velocity > 0) return '↑';
  if (velocity < 0) return '↓';
  return '→';
}

function velocityColor(velocity: number, direction: TradeDirection): string {
  if (velocity === 0) return COLORS.textMuted;
  if (direction === 'LONG') {
    return velocity < 0 ? COLORS.bullish : COLORS.bearish;
  }
  return velocity > 0 ? COLORS.bullish : COLORS.bearish;
}

function fmtPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(4)}`;
}

export function L6FundingExpandV4({
  detail,
  longScore,
  shortScore,
  activeDirection = 'LONG',
}: L6LayerExpandV4Props) {
  const stateLabel = getFundingStateLabel(detail.fundingState);
  const velColor = velocityColor(detail.fundingVelocity, activeDirection);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.subTitle}>{vi.layerCard.l6ExpandTitle}</Text>
        {detail.isFallback ? (
          <View style={styles.fallbackBadge}>
            <Text style={styles.fallbackText}>{vi.layerCard.l6FallbackBadge}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.line}>
        {vi.layerCard.l6Current}: {fmtPct(detail.fundingCurrent)}%
      </Text>

      {!detail.isFallback ? (
        <Text style={styles.line}>
          {vi.layerCard.l6Avg8}: {fmtPct(detail.fundingAvg8)}%
        </Text>
      ) : null}

      <View style={styles.velocityRow}>
        <Text style={styles.line}>{vi.layerCard.l6Velocity}: </Text>
        <Text style={[styles.velocityValue, { color: velColor }]}>
          {velocityArrow(detail.fundingVelocity)} {fmtPct(detail.fundingVelocity)}%
        </Text>
      </View>

      {!detail.isFallback ? (
        <Text style={styles.line}>
          {vi.layerCard.l6State}: {stateLabel.icon} {stateLabel.text}
        </Text>
      ) : null}

      <Text style={styles.scoresLine}>
        {vi.layerCard.l6Scores(longScore.toFixed(1), shortScore.toFixed(1))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    paddingTop: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.border,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  fallbackBadge: {
    backgroundColor: '#F0B90B22',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#F0B90B55',
  },
  fallbackText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.warning,
  },
  line: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  velocityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  velocityValue: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scoresLine: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
