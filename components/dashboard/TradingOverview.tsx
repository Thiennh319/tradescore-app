import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, type AnalysisTimeframe } from '../../constants/scoring';
import { AnalysisTimeframePicker } from './AnalysisTimeframePicker';
import { PANEL, RADIUS, SPACING, TYPO } from '../../constants/theme';
import {
  formatDivergenceVi,
  formatFundingOiVi,
  formatRegimeVi,
  formatScoreBiasVi,
  formatStructureVi,
  formatTrendVi,
  vi,
} from '../../constants/vi';
import type { TradeAnalysis } from '../../hooks/useMarketAnalysis';
import { formatPrice, formatUsdPrice } from '../../utils/formatPrice';
import { divergenceType } from '../../utils/tradingBias';
import type { ScoreBias } from '../../services/scorer';

interface TradingOverviewProps {
  symbol: string;
  price: number | null;
  priceDir: 'up' | 'down' | 'flat';
  analysis: TradeAnalysis | null;
  analysisTimeframe: AnalysisTimeframe;
  onAnalysisTimeframeChange: (tf: AnalysisTimeframe) => void;
  loading: boolean;
  isLive: boolean;
}

type SignalKey = 'trend' | 'structure' | 'divergence' | 'regime';

const aiBiasColor: Record<ScoreBias, string> = {
  STRONG_LONG: COLORS.bullish,
  LONG: COLORS.bullishMuted,
  NEUTRAL: COLORS.neutral,
  SHORT: COLORS.bearishMuted,
  STRONG_SHORT: COLORS.bearish,
};

export function TradingOverview({
  symbol,
  price,
  priceDir,
  analysis,
  analysisTimeframe,
  onAnalysisTimeframeChange,
  loading,
  isLive,
}: TradingOverviewProps) {
  const [selectedSignal, setSelectedSignal] = useState<SignalKey | null>(null);
  const aiScore = analysis?.aiScore;
  const priceColor =
    priceDir === 'up' ? COLORS.bullish : priceDir === 'down' ? COLORS.bearish : COLORS.textPrimary;

  const lastSignal = analysis?.smc.signals[analysis.smc.signals.length - 1];
  const divType = analysis ? divergenceType(analysis.orderFlow.divergences) : 'NONE';
  const fundingRegime = analysis?.orderFlow.fundingOI.regime ?? 'NEUTRAL';

  const toggleSignal = (key: SignalKey) => {
    setSelectedSignal((prev) => (prev === key ? null : key));
  };

  const detailText = (() => {
    if (!analysis || !selectedSignal) return '';
    const conf = (analysis.regime.confidence * 100).toFixed(0);
    switch (selectedSignal) {
      case 'trend':
        return vi.overview.explain.trend(analysis.smc.trend, analysisTimeframe);
      case 'structure':
        return vi.overview.explain.structure(
          lastSignal?.type ?? null,
          analysis.smc.trend,
          lastSignal
            ? formatPrice(symbol, lastSignal.breakPrice)
            : undefined,
        );
      case 'divergence':
        return vi.overview.explain.divergence(divType);
      case 'regime':
        return vi.overview.explain.regime(
          analysis.regime.regime,
          fundingRegime,
          conf,
        );
      default:
        return '';
    }
  })();

  const detailTitle = (() => {
    if (!selectedSignal) return '';
    return vi.overview.signals[selectedSignal];
  })();

  return (
    <View style={styles.card}>
      <View style={styles.accentBar} />

      <View style={styles.topRow}>
        <View style={styles.symbolBlock}>
          <Text style={styles.symbol}>{symbol}</Text>
          <Text style={styles.exchange}>{vi.overview.exchange}</Text>
        </View>
        <View style={styles.statusCol}>
          <View style={[styles.livePill, { borderColor: isLive ? COLORS.bullish : COLORS.warning }]}>
            <View style={[styles.liveDot, { backgroundColor: isLive ? COLORS.bullish : COLORS.warning }]} />
            <Text style={[styles.liveText, { color: isLive ? COLORS.bullish : COLORS.warning }]}>
              {isLive ? vi.market.live : vi.market.cache}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>{vi.market.lastPrice}</Text>
          {loading && price == null ? (
            <ActivityIndicator color={COLORS.accent} style={styles.loader} />
          ) : (
            <Text style={[styles.price, { color: priceColor }]}>
              {formatUsdPrice(symbol, price)}
            </Text>
          )}
        </View>

        <View
          style={[
            styles.biasBox,
            {
              borderColor: aiScore ? aiBiasColor[aiScore.bias] : COLORS.textMuted,
            },
          ]}
        >
          <Text style={styles.biasLabel}>{vi.ai.title}</Text>
          {aiScore ? (
            <>
              <Text style={[styles.aiScoreValue, { color: aiBiasColor[aiScore.bias] }]}>
                {aiScore.finalScore.toFixed(1)}
              </Text>
              <Text style={[styles.biasHint, { color: aiBiasColor[aiScore.bias] }]}>
                {formatScoreBiasVi(aiScore.bias)}
              </Text>
            </>
          ) : (
            <Text style={styles.biasHint}>—</Text>
          )}
        </View>
      </View>

      {analysis ? (
        <>
          <AnalysisTimeframePicker
            selected={analysisTimeframe}
            onSelect={onAnalysisTimeframeChange}
          />

          <Text style={styles.summary}>
            {vi.overview.summary(
              formatRegimeVi(analysis.regime.regime).toLowerCase(),
              formatTrendVi(analysis.smc.trend).toLowerCase(),
              (analysis.regime.confidence * 100).toFixed(0),
              aiScore ? formatScoreBiasVi(aiScore.bias).toLowerCase() : 'chờ dữ liệu',
            )}
          </Text>

          <View style={styles.signalGrid}>
            <SignalCell
              signalKey="trend"
              selected={selectedSignal === 'trend'}
              onPress={toggleSignal}
              label={vi.overview.signals.trend}
              value={formatTrendVi(analysis.smc.trend)}
              color={
                analysis.smc.trend === 'BULLISH'
                  ? COLORS.bullish
                  : analysis.smc.trend === 'BEARISH'
                    ? COLORS.bearish
                    : COLORS.textSecondary
              }
              hint={vi.overview.hints.trend}
            />
            <SignalCell
              signalKey="structure"
              selected={selectedSignal === 'structure'}
              onPress={toggleSignal}
              label={vi.overview.signals.structure}
              value={lastSignal ? lastSignal.type : '—'}
              sub={lastSignal ? formatStructureVi(lastSignal.type) : vi.smc.noSignal}
              color={lastSignal?.type === 'BOS' || lastSignal?.type === 'CHOCH' ? COLORS.accent : COLORS.textMuted}
              hint={vi.overview.hints.structure}
            />
            <SignalCell
              signalKey="divergence"
              selected={selectedSignal === 'divergence'}
              onPress={toggleSignal}
              label={vi.overview.signals.divergence}
              value={formatDivergenceVi(divType)}
              color={
                divType === 'BULLISH'
                  ? COLORS.bullish
                  : divType === 'BEARISH'
                    ? COLORS.bearish
                    : COLORS.textMuted
              }
              hint={vi.overview.hints.divergence}
            />
            <SignalCell
              signalKey="regime"
              selected={selectedSignal === 'regime'}
              onPress={toggleSignal}
              label={vi.overview.signals.regime}
              value={formatRegimeVi(analysis.regime.regime)}
              sub={formatFundingOiVi(fundingRegime)}
              color={COLORS.accent}
              hint={vi.overview.hints.regime}
            />
          </View>

          {selectedSignal ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>{detailTitle}</Text>
              <Text style={styles.detailBody}>{detailText}</Text>
            </View>
          ) : null}

          <Text style={styles.tapHint}>
            {selectedSignal ? vi.overview.closeHint : vi.overview.tapHint}
          </Text>
        </>
      ) : (
        <Text style={styles.waitText}>{vi.overview.waiting}</Text>
      )}
    </View>
  );
}

function SignalCell({
  signalKey,
  selected,
  onPress,
  label,
  value,
  sub,
  color,
  hint,
}: {
  signalKey: SignalKey;
  selected: boolean;
  onPress: (key: SignalKey) => void;
  label: string;
  value: string;
  sub?: string;
  color: string;
  hint: string;
}) {
  return (
    <Pressable
      onPress={() => onPress(signalKey)}
      style={({ pressed }) => [
        styles.signalCell,
        selected && styles.signalCellSelected,
        pressed && styles.signalCellPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={styles.signalLabel}>{label}</Text>
      <Text style={[styles.signalValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={styles.signalSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      <Text style={styles.signalHint} numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...PANEL,
    marginBottom: SPACING.xl,
    padding: 0,
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    backgroundColor: COLORS.accent,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  symbolBlock: {
    gap: 2,
  },
  symbol: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  exchange: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  statusCol: {
    alignItems: 'flex-end',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    backgroundColor: COLORS.background,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  priceBlock: {
    flex: 1,
    minWidth: 160,
  },
  priceLabel: {
    ...TYPO.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  price: {
    ...TYPO.hero,
    fontVariant: ['tabular-nums'],
  },
  loader: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  biasBox: {
    minWidth: 120,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  biasLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  biasValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  aiScoreValue: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  biasHint: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  summary: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  signalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  signalCell: {
    flex: 1,
    minWidth: 140,
    padding: SPACING.md,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 3,
  },
  signalCellSelected: {
    backgroundColor: 'rgba(240, 185, 11, 0.08)',
    borderBottomColor: COLORS.accent,
  },
  signalCellPressed: {
    opacity: 0.85,
  },
  signalLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signalValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  signalSub: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  signalHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
    lineHeight: 14,
  },
  detailCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 8,
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailBody: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  tapHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  waitText: {
    fontSize: 12,
    color: COLORS.textMuted,
    padding: SPACING.lg,
    paddingTop: 0,
  },
});
