import { StyleSheet, Text, View } from 'react-native';
import { COLORS, LAYER_MAX_POINTS, type LayerResult } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import { L6FundingExpandV4, type L6LayerExpandV4Props } from './L6FundingExpandV4';
import { L11SqueezeExpandV4, type L11LayerExpandV4Props } from './L11SqueezeExpandV4';

interface LayerCardProps {
  layers: LayerResult[];
  title?: string;
  /** NEAR SHORT S3 — hiện "tín hiệu mạnh" cạnh L3 khi signalTags có STRONG_L3 */
  strongL3Label?: boolean;
  /** V4 — mở rộng L6 Funding State */
  l6ExpandV4?: L6LayerExpandV4Props;
  /** V4 — L11 Squeeze Risk (bổ sung, không nằm trong thang 15 điểm) */
  l11ExpandV4?: L11LayerExpandV4Props;
}

/** Danh sách chi tiết điểm 10 lớp chấm điểm + L11 Squeeze Risk (V4). */
export function LayerCard({
  layers,
  title,
  strongL3Label,
  l6ExpandV4,
  l11ExpandV4,
}: LayerCardProps) {
  if (layers.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>{vi.layerCard.empty}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title ?? vi.layerCard.title}</Text>
      {layers.map((layer) => {
        const pct = Math.max(0, Math.min(1, layer.score / LAYER_MAX_POINTS));
        const barColor = layer.isMandatoryViolation
          ? COLORS.bearish
          : layer.score >= 1
            ? COLORS.bullish
            : layer.score > 0
              ? COLORS.warning
              : COLORS.textMuted;

        return (
          <View key={layer.layer} style={styles.row}>
            <View style={styles.head}>
              <Text style={styles.name} numberOfLines={1}>
                <Text style={styles.layerNo}>L{layer.layer} </Text>
                {layer.name}
              </Text>
              <Text style={[styles.score, { color: barColor }]}>
                {layer.score.toFixed(1)}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
            </View>
            {layer.reason ? (
              <Text style={styles.reason} numberOfLines={2}>
                {layer.isMandatoryViolation ? '⚠ ' : ''}
                {layer.reason}
              </Text>
            ) : null}
            {layer.layer === 3 && strongL3Label ? (
              <Text style={styles.strongL3}>tín hiệu mạnh</Text>
            ) : null}
            {layer.layer === 6 && l6ExpandV4 ? (
              <L6FundingExpandV4 {...l6ExpandV4} />
            ) : null}
          </View>
        );
      })}
      {l11ExpandV4 ? <L11SqueezeExpandV4 {...l11ExpandV4} /> : null}
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
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  empty: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  row: {
    gap: 4,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  layerNo: {
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  score: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginLeft: SPACING.sm,
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceElevated,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  reason: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  strongL3: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    marginTop: 2,
  },
});
