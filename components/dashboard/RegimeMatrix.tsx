import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COLORS,
  LAYER_NAMES,
  REGIME_WEIGHTS,
  type LayerName,
  type MarketRegime,
} from '../../constants/scoring';
import type { LayerScores } from '../../services/scorer';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { formatLayerVi, formatRegimeTabVi, vi } from '../../constants/vi';

const REGIMES: MarketRegime[] = [
  'TRENDING_BULL',
  'TRENDING_BEAR',
  'MEAN_REVERSION',
  'HIGH_VOLATILITY_CHOP',
];

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface RegimeMatrixProps {
  selected: MarketRegime;
  onSelect: (regime: MarketRegime) => void;
  layerScores?: LayerScores;
}

export function RegimeMatrix({ selected, onSelect, layerScores }: RegimeMatrixProps) {
  const weights = REGIME_WEIGHTS[selected];
  const sorted = [...LAYER_NAMES].sort(
    (a, b) => (weights[b] ?? 0) - (weights[a] ?? 0),
  );
  const maxWeight = weights[sorted[0]] ?? 1;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{vi.matrix.title}</Text>
        <Text style={styles.caption}>{vi.matrix.caption}</Text>
      </View>

      <View style={styles.tabs}>
        {REGIMES.map((regime) => {
          const active = selected === regime;
          return (
            <Pressable
              key={regime}
              onPress={() => onSelect(regime)}
              style={[styles.tab, active && styles.tabActive, webPointer]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {formatRegimeTabVi(regime)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.colHead, styles.colLayer]}>{vi.matrix.layer}</Text>
        <Text style={[styles.colHead, styles.colWeight]}>{vi.matrix.weight}</Text>
        {layerScores ? (
          <Text style={[styles.colHead, styles.colLive]}>{vi.matrix.liveScore}</Text>
        ) : null}
        <Text style={[styles.colHead, styles.colBar]}>{vi.matrix.distribution}</Text>
      </View>

      {sorted.map((layer, index) => {
        const w = weights[layer] ?? 0;
        const pct = Math.round(w * 100);
        const barPct = (w / maxWeight) * 100;
        const highlight =
          layer === 'BOS_CHOCH' || layer === 'BOLLINGER' || layer === 'FUNDING_OI';

        return (
          <View
            key={layer}
            style={[styles.row, index % 2 === 0 && styles.rowAlt]}
          >
            <Text
              style={[styles.layerName, highlight && styles.layerHighlight]}
              numberOfLines={1}
            >
              {formatLayerVi(layer)}
            </Text>
            <Text style={styles.weightVal}>{pct}%</Text>
            {layerScores ? (
              <Text style={styles.liveVal}>{Math.round(layerScores[layer])}</Text>
            ) : null}
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${barPct}%`,
                    backgroundColor: barColor(layer, selected),
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function barColor(layer: LayerName, regime: MarketRegime): string {
  if (layer === 'BOS_CHOCH') return COLORS.accent;
  if (layer === 'FUNDING_OI' || layer === 'CVD_DIVERGENCE') return COLORS.info;
  if (regime === 'MEAN_REVERSION' && (layer === 'BOLLINGER' || layer === 'RSI')) {
    return COLORS.bullish;
  }
  if (regime.startsWith('TRENDING')) return COLORS.bullishMuted;
  return COLORS.textSecondary;
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    flex: 1,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  caption: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  tabActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.08)',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.accent,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 4,
  },
  colHead: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  colLayer: { flex: 1.2 },
  colWeight: { width: 44, textAlign: 'right' },
  colLive: { width: 36, textAlign: 'right' },
  colBar: { flex: 1, marginLeft: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  rowAlt: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  layerName: {
    flex: 1.2,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  layerHighlight: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  weightVal: {
    width: 44,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  liveVal: {
    width: 36,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 2,
    marginLeft: 12,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
