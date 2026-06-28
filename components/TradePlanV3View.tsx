import { useCallback, useState } from 'react';
import {
  Clipboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import {
  COLORS,
  THEME_COLORS,
  TRADE_PLAN_V3_CONFIG,
  type AppTradeSymbol,
  type TradePlanV3,
} from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { formatUsdPrice } from '../utils/formatPrice';
import { vi } from '../constants/vi';
import { isTpProbabilityDisplayable, formatTpProbabilityLabel } from '../services/tradePlanPresentation';
import { formatEntryBufferLabel } from '../services/tradePlanEntryBuffer';
import {
  buildProminentBlockReasons,
  isBlockedFinalDecision,
  planBlockedByRr,
  resolveFinalEntryDecision,
  shouldShowExpectedValue,
  shouldShowRrScore,
  shouldShowTpLevels,
  shouldShowWaitBanner,
  shouldShowWinProbability,
  type FinalEntryDecision,
} from '../services/tradePlanDisplay';
import { FinalEntryStatus } from '../types/scoring';
import type { TradeDecisionLabel } from '../constants/scoring';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface TradePlanV3ViewProps {
  plan: TradePlanV3;
  /** Quyết định cuối từ scoring — điều khiển ẩn/mờ FOMO guard */
  finalDecision?: FinalEntryDecision;
  /** Trạng thái vào lệnh cuối — badge entry zone WAIT */
  finalEntryStatus?: FinalEntryStatus;
  /** Lý do HARD BLOCK từ engine scoring */
  hardBlockReasons?: string[];
  onConfirmEntry: () => void;
  onPlacePending: (limitPrice: number) => void;
  /** Nhúng trong thẻ Signal Board — tránh ScrollView lồng nhau */
  embedded?: boolean;
  /** L11 EXTREME squeeze — banner cảnh báo phía trên kế hoạch */
  squeezeWarning?: string | null;
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

function fmtPrice(symbol: string, price: number): string {
  return formatUsdPrice(symbol as AppTradeSymbol, price);
}

export function TradePlanV3View({
  plan,
  finalDecision: finalDecisionProp,
  finalEntryStatus,
  hardBlockReasons = [],
  onConfirmEntry,
  onPlacePending,
  embedded = false,
  squeezeWarning = null,
}: TradePlanV3ViewProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const symbol = plan.symbol as AppTradeSymbol;

  const finalDecision =
    finalDecisionProp ??
    resolveFinalEntryDecision({
      decisionLabel: plan.decision as TradeDecisionLabel,
      hardBlocked: false,
      awaitingRescore: plan.decision === 'CHO_TAI_CHAM',
    });
  const blocked = isBlockedFinalDecision(finalDecision);
  const showWaitBanner = shouldShowWaitBanner(finalDecision);
  const showTpLevels = shouldShowTpLevels(finalDecision);
  const showWinProbability = shouldShowWinProbability(finalDecision);
  const showExpectedValue = shouldShowExpectedValue(finalDecision);
  const showRrScore = shouldShowRrScore(finalDecision);
  const prominentBlocks = buildProminentBlockReasons(
    finalDecision,
    plan,
    hardBlockReasons,
  );
  const isWaitEntry = finalEntryStatus === FinalEntryStatus.WAIT_ENTRY;
  const rrEntryHighlight = (blocked && planBlockedByRr(plan)) || isWaitEntry;
  const showEntryQualityBadge = !rrEntryHighlight && !isWaitEntry;

  const copyToClipboard = useCallback(async (value: string, field: string) => {
    await copyPrice(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const CopyButton = ({ value, field }: { value: string; field: string }) => (
    <Pressable onPress={() => void copyToClipboard(value, field)} style={[styles.copyBtn, webPointer]}>
      <Text style={styles.copyBtnText}>{copiedField === field ? '✅' : '📋'}</Text>
    </Pressable>
  );

  const PriceRow = ({
    label,
    price,
    color,
    field,
    extra,
  }: {
    label: string;
    price: number;
    color: string;
    field: string;
    extra?: string;
  }) => (
    <View style={styles.priceRow}>
      <Text style={styles.priceLabel}>{label}</Text>
      <View style={styles.priceRight}>
        <Text style={[styles.priceValue, { color }]}>{fmtPrice(symbol, price)}</Text>
        {extra ? <Text style={styles.priceExtra}>{extra}</Text> : null}
        <CopyButton value={price.toFixed(4)} field={field} />
      </View>
    </View>
  );

  const qualityColor =
    {
      PERFECT: THEME_COLORS.green,
      GOOD: THEME_COLORS.green,
      ACCEPTABLE: THEME_COLORS.yellow,
      RISKY: '#FF8C00',
      MISS: THEME_COLORS.red,
    }[plan.entryZone.quality] ?? THEME_COLORS.textSecondary;

  const slQualityColor =
    {
      TIGHT: THEME_COLORS.yellow,
      NORMAL: THEME_COLORS.green,
      WIDE: THEME_COLORS.yellow,
    }[plan.stopLoss.quality] ?? THEME_COLORS.textSecondary;

  const entryBufferLabel =
    plan.entryBufferPct != null && plan.entryBufferSource != null
      ? formatEntryBufferLabel(plan.entryBufferPct, plan.entryBufferSource)
      : null;

  const winPctColor =
    plan.winProbabilityEstimate >= 0.7
      ? THEME_COLORS.green
      : plan.winProbabilityEstimate >= 0.65
        ? THEME_COLORS.yellow
        : THEME_COLORS.red;

  const body = (
    <>
      {squeezeWarning ? (
        <View style={styles.squeezeWarningBanner} testID="squeeze-warning-banner">
          <Text style={styles.squeezeWarningText}>⚠️ {squeezeWarning}</Text>
        </View>
      ) : null}

      {showWaitBanner ? (
        <View style={styles.waitBanner} testID="wait-banner">
          <Text style={styles.waitBannerText}>{vi.tradePlanView.waitBanner}</Text>
        </View>
      ) : null}

      {blocked && prominentBlocks.length > 0 ? (
        <View style={styles.blockReasonHero} testID="block-reason">
          {prominentBlocks.map((reason, i) => (
            <Text key={i} style={styles.blockReasonHeroText}>
              {reason}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.symbol}>
          {plan.symbol.replace('USDT', '')} {plan.direction}
        </Text>
        <View style={styles.headerBadges}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  plan.marketMode === 'TRENDING' ? '#F0B90B20' : '#0ECB8120',
              },
            ]}
          >
            <Text
              style={{
                color:
                  plan.marketMode === 'TRENDING' ? THEME_COLORS.yellow : THEME_COLORS.green,
                fontSize: 11,
              }}
            >
              {plan.marketMode === 'TRENDING' ? '🔥 TRENDING' : '↔️ RANGING'}
            </Text>
          </View>
          {showRrScore ? (
            <Text
              testID="rr-score"
              style={[
                styles.rrScore,
                {
                  color:
                    plan.riskRewardScore >= 70 ? THEME_COLORS.green : THEME_COLORS.yellow,
                },
              ]}
            >
              RR Score: {plan.riskRewardScore}/100
            </Text>
          ) : null}
        </View>
      </View>

      {!blocked && plan.tp1LowProbabilityWarning ? (
        <View style={styles.tp1BlockBox}>
          <Text style={styles.tp1BlockText}>{plan.tp1LowProbabilityWarning}</Text>
        </View>
      ) : null}

      {!blocked && (showWinProbability || showExpectedValue) ? (
        <View style={styles.probCard}>
          {showWinProbability ? (
            <View style={styles.probRow} testID="win-probability">
              <Text style={styles.probLabel}>Xác suất thắng ước tính</Text>
              <Text style={[styles.probValue, { color: winPctColor }]}>
                {(plan.winProbabilityEstimate * 100).toFixed(0)}%
              </Text>
            </View>
          ) : null}
          {showExpectedValue ? (
            <View style={styles.probRow} testID="expected-value">
              <Text style={styles.probLabel}>Expected Value</Text>
              <Text
                style={[
                  styles.probValue,
                  {
                    color:
                      plan.expectedValueUSDT >= 0 ? THEME_COLORS.green : THEME_COLORS.red,
                  },
                ]}
              >
                {plan.expectedValueUSDT >= 0 ? '+' : ''}
                {plan.expectedValueUSDT.toFixed(2)} USDT
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📍 VÙNG VÀO LỆNH</Text>
          {showEntryQualityBadge ? (
            <View style={[styles.badge, { backgroundColor: `${qualityColor}30` }]}>
              <Text style={{ color: qualityColor, fontSize: 11 }}>{plan.entryZone.quality}</Text>
            </View>
          ) : null}
        </View>
        {rrEntryHighlight ? (
          <Text style={styles.rrWaitHighlight} testID="rr-entry-wait">
            {vi.tradePlanView.waitForRrEntry(fmtPrice(symbol, plan.entryZone.optimal))}
          </Text>
        ) : null}
        <Text style={styles.reasoning}>💡 {plan.entryZone.reasoning}</Text>
        {entryBufferLabel ? (
          <Text style={styles.bufferLabel} testID="entry-buffer-label">
            {entryBufferLabel}
          </Text>
        ) : null}
        <PriceRow
          label="🎯 Limit tối ưu"
          price={plan.entryZone.optimal}
          color={THEME_COLORS.yellow}
          field="entry_optimal"
          extra={`${plan.entryZone.distanceFromCurrentPct.toFixed(2)}% từ giá`}
        />
        <PriceRow
          label="⚡ Aggressive"
          price={plan.entryZone.aggressive}
          color={THEME_COLORS.textSecondary}
          field="entry_aggressive"
        />
        <PriceRow
          label="🕐 Conservative"
          price={plan.entryZone.conservative}
          color={THEME_COLORS.textSecondary}
          field="entry_conservative"
        />
        <View style={styles.rangeBar}>
          <Text style={styles.rangeText}>
            Vùng: {fmtPrice(symbol, plan.entryZone.rangeLow)}
            {'  —  '}
            {fmtPrice(symbol, plan.entryZone.rangeHigh)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🛡️ STOP LOSS</Text>
          <View style={[styles.badge, { backgroundColor: `${slQualityColor}30` }]}>
            <Text style={{ color: slQualityColor, fontSize: 11 }}>
              {plan.stopLoss.quality} · {plan.stopLoss.atrDistance.toFixed(1)}×ATR
            </Text>
          </View>
        </View>
        <Text style={styles.reasoning}>
          {plan.stopLoss.isProtectedByWall
            ? '🐋 Nấp sau Whale Wall — rất an toàn'
            : `📐 ${plan.stopLoss.reasoning}`}
        </Text>
        {plan.stopLoss.slMultiplierNote ? (
          <Text style={styles.multiplierNote}>{plan.stopLoss.slMultiplierNote}</Text>
        ) : null}
        <PriceRow
          label="❌ Stop Loss"
          price={plan.stopLoss.price}
          color={THEME_COLORS.red}
          field="sl"
          extra={`-${plan.stopLoss.distancePct.toFixed(2)}% / max -${plan.stopLoss.maxLossUSDT.toFixed(2)} USDT`}
        />
      </View>

      {showTpLevels ? (
        <View style={styles.section} testID="take-profit-section">
          <Text style={styles.sectionTitle}>🎯 TAKE PROFIT</Text>
          {[
            { tp: plan.tp1, label: 'TP1', pct: 50, n: 1, testId: 'TP1' },
            { tp: plan.tp2, label: 'TP2', pct: 30, n: 2, testId: 'TP2' },
            { tp: plan.tp3, label: 'TP3', pct: 20, n: 3, testId: 'TP3' },
          ].map(({ tp, label, pct, n, testId }) => {
            const showTp = isTpProbabilityDisplayable(tp.probability);
            const probPct = (tp.probability * 100).toFixed(0);
            return (
              <View
                key={label}
                testID={testId}
                style={[styles.tpRow, !showTp && styles.tpRowHidden]}
              >
                {showTp ? (
                  <>
                    <View style={styles.tpLeft}>
                      <Text style={styles.tpLabel}>{label}</Text>
                      <Text style={styles.tpMeta}>
                        R:R {tp.rrRatio.toFixed(1)}:1 · Chốt {pct}% · +
                        {tp.expectedPnlUSDT.toFixed(2)} USDT
                      </Text>
                      <Text style={styles.tpProb} testID={`${testId}-prob`}>
                        {formatTpProbabilityLabel(tp.probability)}
                      </Text>
                      <Text style={styles.tpReasoning}>{tp.reasoning}</Text>
                    </View>
                    <View style={styles.tpRight}>
                      <Text style={styles.tpPrice}>{fmtPrice(symbol, tp.price)}</Text>
                      <CopyButton value={tp.price.toFixed(4)} field={label} />
                    </View>
                  </>
                ) : (
                  <Text style={styles.tpHiddenText}>
                    {vi.tradePlanView.tpLowProbHidden(n, probPct)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.positionCard, blocked && styles.positionCardBlocked]}>
        <Text style={styles.sectionTitle}>💼 VỊ THẾ</Text>
        <View style={styles.posGrid}>
          <View style={[styles.posItem, blocked && styles.posItemDimmed]} pointerEvents={blocked ? 'none' : 'auto'}>
            <Text style={styles.posKey}>Margin</Text>
            <Text style={styles.posVal}>{plan.positionSizeAdjusted.toFixed(2)} USDT</Text>
          </View>
          <View style={styles.posItem}>
            <Text style={styles.posKey}>Đòn bẩy</Text>
            <Text style={styles.posVal}>{TRADE_PLAN_V3_CONFIG.LEVERAGE}×</Text>
          </View>
          <View style={[styles.posItem, blocked && styles.posItemDimmed]} pointerEvents={blocked ? 'none' : 'auto'}>
            <Text style={styles.posKey}>Notional</Text>
            <Text style={styles.posVal}>{plan.notionalValue.toFixed(2)} USDT</Text>
          </View>
          <View style={[styles.posItem, blocked && styles.posItemDimmed]} pointerEvents={blocked ? 'none' : 'auto'}>
            <Text style={styles.posKey}>Max Loss</Text>
            <Text style={styles.posVal}>{plan.stopLoss.maxLossUSDT.toFixed(2)} USDT</Text>
            {!blocked ? (
              <>
                <Text style={styles.posHint}>{vi.tradePlanView.maxLossTooltipIntro}</Text>
                <Text style={styles.posHint}>
                  {vi.tradePlanView.maxLossTooltipTier(
                    plan.stopLoss.tierName ?? plan.capitalTierName ?? 'GD?',
                    (plan.stopLoss.tierMaxLossPerTrade ?? plan.stopLoss.maxLossUSDT).toFixed(2),
                  )}
                </Text>
                <Text style={styles.posHint}>
                  {vi.tradePlanView.maxLossTooltipActual(
                    plan.stopLoss.maxLossUSDT.toFixed(2),
                  )}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>

      {!blocked && plan.warnings.length > 0 ? (
        <View style={styles.warningBox}>
          {plan.warnings.map((w, i) => (
            <Text key={i} style={styles.warningText}>
              ⚠️ {w}
            </Text>
          ))}
        </View>
      ) : null}

      {!blocked && plan.blockReasons.length > 0 ? (
        <View style={styles.blockBox}>
          <Text style={styles.blockTitle}>❌ KHÔNG VÀO LỆNH</Text>
          {plan.blockReasons.map((r, i) => (
            <Text key={i} style={styles.blockText}>
              {r}
            </Text>
          ))}
        </View>
      ) : null}

      {plan.isValid &&
      plan.tradePlanValid &&
      !blocked &&
      !showWaitBanner &&
      !isWaitEntry ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onPlacePending(plan.entryZone.optimal)}
            style={[styles.btnPrimary, webPointer]}
          >
            <Text style={styles.btnText}>
              ⏳ Đặt Limit {fmtPrice(symbol, plan.entryZone.optimal)}
            </Text>
          </Pressable>
          {plan.entryZone.entryType === 'MARKET_OK' ? (
            <Pressable onPress={onConfirmEntry} style={[styles.btnSecondary, webPointer]}>
              <Text style={[styles.btnText, { color: THEME_COLORS.textPrimary }]}>
                ✅ Vào Market ngay
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!embedded ? <View style={{ height: 40 }} /> : null}
    </>
  );

  if (embedded) {
    return <View style={styles.containerEmbedded}>{body}</View>;
  }

  return <ScrollView style={styles.container}>{body}</ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME_COLORS.background },
  containerEmbedded: {
    backgroundColor: COLORS.background,
    gap: SPACING.sm,
  } as ViewStyle,
  header: {
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symbol: {
    color: THEME_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerBadges: { alignItems: 'flex-end', gap: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  rrScore: { fontSize: 12, fontWeight: 'bold' },
  waitBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: '#F0B90B20',
    borderLeftWidth: 3,
    borderLeftColor: THEME_COLORS.yellow,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  squeezeWarningBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: '#F6465D22',
    borderLeftWidth: 3,
    borderLeftColor: THEME_COLORS.red,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  squeezeWarningText: {
    color: THEME_COLORS.red,
    fontSize: 13,
    fontWeight: '700',
  },
  waitBannerText: {
    color: THEME_COLORS.yellow,
    fontSize: 13,
    fontWeight: '600',
  },
  blockReasonHero: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: '#F6465D22',
    borderWidth: 1,
    borderColor: THEME_COLORS.red,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: 8,
  },
  blockReasonHeroText: {
    color: THEME_COLORS.red,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  rrWaitHighlight: {
    color: '#FF8C00',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: '#FF8C0018',
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  probCard: {
    margin: SPACING.md,
    marginTop: 0,
    backgroundColor: THEME_COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: SPACING.sm,
  },
  probRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  probLabel: { color: THEME_COLORS.textSecondary, fontSize: 13 },
  probValue: { fontSize: 18, fontWeight: 'bold' },
  section: {
    margin: SPACING.md,
    marginTop: 0,
    backgroundColor: THEME_COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: THEME_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  reasoning: {
    color: THEME_COLORS.yellow,
    fontSize: 12,
    fontStyle: 'italic',
  },
  bufferLabel: {
    color: THEME_COLORS.textSecondary,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 4,
  },
  multiplierNote: {
    color: THEME_COLORS.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  priceLabel: { color: THEME_COLORS.textSecondary, fontSize: 13, flex: 1 },
  priceRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexShrink: 1 },
  priceValue: { fontSize: 16, fontWeight: 'bold' },
  priceExtra: { color: THEME_COLORS.textSecondary, fontSize: 11 },
  copyBtn: { padding: 4 },
  copyBtnText: { fontSize: 14 },
  rangeBar: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  rangeText: {
    color: THEME_COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  tpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceElevated,
  },
  tpRowHidden: {
    opacity: 0.4,
  },
  tpHiddenText: {
    color: THEME_COLORS.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  tp1BlockBox: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: '#F6465D18',
    borderLeftWidth: 3,
    borderLeftColor: THEME_COLORS.red,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  tp1BlockText: {
    color: THEME_COLORS.red,
    fontSize: 13,
    fontWeight: '600',
  },
  tpLeft: { flex: 1, gap: 2 },
  tpRight: { alignItems: 'flex-end', gap: 4 },
  tpLabel: {
    color: THEME_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  tpMeta: { color: THEME_COLORS.green, fontSize: 11 },
  tpProb: { color: THEME_COLORS.textSecondary, fontSize: 11 },
  tpReasoning: { color: THEME_COLORS.textSecondary, fontSize: 10 },
  tpPrice: {
    color: THEME_COLORS.green,
    fontSize: 15,
    fontWeight: 'bold',
  },
  positionCard: {
    margin: SPACING.md,
    marginTop: 0,
    backgroundColor: THEME_COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: SPACING.sm,
  },
  positionCardBlocked: {
    pointerEvents: 'none',
  },
  posGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  posItem: {
    width: '47%',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    padding: 10,
  },
  posItemDimmed: {
    opacity: 0.3,
  },
  posKey: { color: THEME_COLORS.textSecondary, fontSize: 11 },
  posVal: {
    color: THEME_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  posHint: {
    color: THEME_COLORS.textSecondary,
    fontSize: 10,
    marginTop: 4,
    lineHeight: 14,
  },
  warningBox: {
    margin: SPACING.md,
    marginTop: 0,
    backgroundColor: '#F0B90B15',
    borderLeftWidth: 3,
    borderLeftColor: THEME_COLORS.yellow,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    gap: 6,
  },
  warningText: { color: THEME_COLORS.yellow, fontSize: 12 },
  blockBox: {
    margin: SPACING.md,
    marginTop: 0,
    backgroundColor: '#F6465D15',
    borderLeftWidth: 3,
    borderLeftColor: THEME_COLORS.red,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    gap: 6,
  },
  blockTitle: {
    color: THEME_COLORS.red,
    fontSize: 14,
    fontWeight: 'bold',
  },
  blockText: { color: THEME_COLORS.red, fontSize: 12 },
  actions: { margin: SPACING.md, gap: 10 },
  btnPrimary: {
    backgroundColor: THEME_COLORS.yellow,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: COLORS.surfaceElevated,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  btnText: { fontSize: 15, fontWeight: 'bold', color: '#000' },
});
