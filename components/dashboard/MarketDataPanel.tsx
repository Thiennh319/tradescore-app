import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, DEFAULT_SETTINGS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import type { AllMarketData } from '../../services/binanceApi';

const PRICE_POLL_MS = 3_000;

interface MarketDataPanelProps {
  symbol: string;
  market: AllMarketData | null;
  loading: boolean;
  error: string | null;
  tfLoaded: number;
  onRefresh: () => void;
}

export function MarketDataPanel({
  symbol,
  market,
  loading,
  error,
  tfLoaded,
  onRefresh,
}: MarketDataPanelProps) {
  const oi = market?.oiEngine?.current.openInterest;
  const funding = market?.fundingHistory?.records.at(-1)?.fundingRate;
  const bidLevels = market?.orderBook?.bids.length ?? 0;
  const askLevels = market?.orderBook?.asks.length ?? 0;
  const errorCount = Object.keys(market?.errors ?? {}).length;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.caption}>
            {vi.market.caption(symbol, PRICE_POLL_MS / 1000)}
          </Text>
        </View>
        <Pressable onPress={onRefresh} style={styles.refreshBtn} disabled={loading}>
          <Text style={styles.refreshText}>{loading ? '…' : '↻'}</Text>
        </Pressable>
      </View>

      {loading && !market ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.accent} size="small" />
          <Text style={styles.loadingText}>{vi.market.loading}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {market ? (
        <>
          <View style={styles.metrics}>
            <FeedMetric
              label={vi.market.openInterest}
              hint={vi.market.oiHint}
              value={oi != null ? oi.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            />
            <FeedMetric
              label={vi.market.funding}
              hint={vi.market.fundingHint}
              value={funding != null ? `${(funding * 100).toFixed(4)}%` : '—'}
              accent={funding != null && funding < 0 ? 'bearish' : 'bullish'}
            />
            <FeedMetric
              label={vi.market.depthLevels}
              hint={vi.market.depthHint}
              value={`${bidLevels} / ${askLevels}`}
            />
            <FeedMetric
              label={vi.market.timeframes}
              hint={vi.market.tfHint}
              value={`${tfLoaded}/5`}
              accent={tfLoaded === 5 ? 'bullish' : 'neutral'}
            />
          </View>

          <View style={styles.statusRow}>
            {market.fromCache ? (
              <Badge label={vi.market.cache} color={COLORS.warning} />
            ) : (
              <Badge label={vi.market.live} color={COLORS.bullish} />
            )}
            <Text style={styles.statusText}>
              {vi.market.status(DEFAULT_SETTINGS.refreshInterval, errorCount)}
            </Text>
          </View>

          {errorCount > 0 ? (
            <Text style={styles.errorHint}>
              {Object.entries(market.errors)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n')}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function FeedMetric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'bullish' | 'bearish' | 'neutral';
}) {
  const color =
    accent === 'bearish' ? COLORS.bearish : accent === 'bullish' ? COLORS.bullish : COLORS.textPrimary;
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    padding: SPACING.lg,
    marginBottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  caption: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  refreshText: {
    fontSize: 16,
    color: COLORS.accent,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  metric: {
    flex: 1,
    minWidth: 130,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 3,
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
  errorText: {
    fontSize: 11,
    color: COLORS.bearish,
    marginBottom: 8,
  },
  errorHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 8,
    fontFamily: 'monospace',
  },
});
