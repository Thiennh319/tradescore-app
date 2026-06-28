import Slider from '@react-native-community/slider';
import { TradePlanView } from './TradePlanView';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  COLORS,
  DEFAULT_SETTINGS,
  type AppTradeSymbol,
  type TradeDirection,
  type TradePlan,
} from '../constants/scoring';
import type { StrategySource } from '../constants/aiJournal';
import { RADIUS, SPACING } from '../constants/theme';
import { symbolLabelVi, vi } from '../constants/vi';
import {
  formatPrice,
  formatUsdPrice,
  formatUsdt,
  parsePriceInput,
  parseUsdtInput,
} from '../utils/formatPrice';

const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 50;

export interface ManualTradeSetup {
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  marginUsdt: number;
  leverage: number;
  /** Nguồn kế hoạch — journal snapshot dùng V3 khi 'v3' */
  planSource?: 'v2' | 'v3' | 'v4';
  /** V3 | V4 | CVDX | MANUAL — từ màn hình khởi tạo lệnh */
  strategySource?: StrategySource;
}

/** @deprecated dùng ManualTradeSetup */
export type ManualTradePrices = ManualTradeSetup;

type PriceField = keyof Pick<
  ManualTradeSetup,
  'entryPrice' | 'stopLoss' | 'takeProfit1' | 'takeProfit2' | 'takeProfit3'
>;

interface EditableFields {
  entryPrice: string;
  stopLoss: string;
  takeProfit1: string;
  takeProfit2: string;
  takeProfit3: string;
}

interface TradeRecommendationTableProps {
  symbol: AppTradeSymbol;
  direction: TradeDirection;
  plan: TradePlan;
  defaultMargin?: number;
  defaultLeverage?: number;
  /** Mở sẵn form chi tiết (vd. khi sửa lệnh chờ) */
  initialShowDetail?: boolean;
  onSetupChange?: (setup: ManualTradeSetup | null) => void;
}

interface PlanRow {
  key: PriceField;
  label: string;
  color: string;
  hint?: string;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

function planToFields(plan: TradePlan, symbol: AppTradeSymbol): EditableFields {
  const toStr = (n: number) => (Number.isFinite(n) ? formatPrice(symbol, n) : '');
  return {
    entryPrice: toStr(plan.entryPrice),
    stopLoss: toStr(plan.stopLoss),
    takeProfit1: toStr(plan.takeProfit1),
    takeProfit2: toStr(plan.takeProfit2),
    takeProfit3: toStr(plan.takeProfit3),
  };
}

export function buildManualTradeSetup(
  symbol: AppTradeSymbol,
  fields: EditableFields,
  marginUsdt: number,
  leverage: number,
): ManualTradeSetup | null {
  const entryPrice = parsePriceInput(symbol, fields.entryPrice);
  const stopLoss = parsePriceInput(symbol, fields.stopLoss);
  const takeProfit1 = parsePriceInput(symbol, fields.takeProfit1);
  const takeProfit2 = parsePriceInput(symbol, fields.takeProfit2);
  const takeProfit3 = parsePriceInput(symbol, fields.takeProfit3);
  if (
    entryPrice == null ||
    stopLoss == null ||
    takeProfit1 == null ||
    takeProfit2 == null ||
    takeProfit3 == null ||
    !Number.isFinite(marginUsdt) ||
    marginUsdt <= 0 ||
    !Number.isInteger(leverage) ||
    leverage < MIN_LEVERAGE ||
    leverage > MAX_LEVERAGE
  ) {
    return null;
  }
  return {
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    marginUsdt,
    leverage,
  };
}

function fieldsEqual(a: EditableFields, b: EditableFields): boolean {
  return (
    a.entryPrice === b.entryPrice &&
    a.stopLoss === b.stopLoss &&
    a.takeProfit1 === b.takeProfit1 &&
    a.takeProfit2 === b.takeProfit2 &&
    a.takeProfit3 === b.takeProfit3
  );
}

function setupSignatureOf(setup: ManualTradeSetup | null): string {
  if (!setup) return '';
  return [
    setup.entryPrice,
    setup.stopLoss,
    setup.takeProfit1,
    setup.takeProfit2,
    setup.takeProfit3,
    setup.marginUsdt,
    setup.leverage,
  ].join('|');
}

/** Bảng Entry / SL / TP + vốn & đòn bẩy — chỉnh được trước khi ghi nhận. */
export function TradeRecommendationTable({
  symbol,
  direction,
  plan,
  defaultMargin = DEFAULT_SETTINGS.sizePerTrade,
  defaultLeverage = DEFAULT_SETTINGS.leverage,
  initialShowDetail = false,
  onSetupChange,
}: TradeRecommendationTableProps) {
  const isLong = direction === 'LONG';
  const dirColor = isLong ? COLORS.bullish : COLORS.bearish;
  const base = symbolLabelVi(symbol);
  const planSignature = useMemo(
    () =>
      [
        plan.entryPrice,
        plan.stopLoss,
        plan.takeProfit1,
        plan.takeProfit2,
        plan.takeProfit3,
      ].join('|'),
    [
      plan.entryPrice,
      plan.stopLoss,
      plan.takeProfit1,
      plan.takeProfit2,
      plan.takeProfit3,
    ],
  );
  const [fields, setFields] = useState<EditableFields>(() => planToFields(plan, symbol));
  const [marginText, setMarginText] = useState(() => formatUsdt(defaultMargin));
  const [leverage, setLeverage] = useState(defaultLeverage);
  const [showDetail, setShowDetail] = useState(initialShowDetail);

  useEffect(() => {
    const next = planToFields(plan, symbol);
    setFields((prev) => (fieldsEqual(prev, next) ? prev : next));
  }, [planSignature, symbol]);

  const onSetupChangeRef = useRef(onSetupChange);
  onSetupChangeRef.current = onSetupChange;
  const lastSetupSigRef = useRef('');

  useEffect(() => {
    setMarginText(formatUsdt(defaultMargin));
    setLeverage(defaultLeverage);
  }, [defaultMargin, defaultLeverage]);

  const marginUsdt = useMemo(() => parseUsdtInput(marginText), [marginText]);
  const marginInvalid = marginText.trim().length > 0 && marginUsdt == null;

  const parsed = useMemo(
    () =>
      marginUsdt != null
        ? buildManualTradeSetup(symbol, fields, marginUsdt, leverage)
        : null,
    [symbol, fields, marginUsdt, leverage],
  );

  useEffect(() => {
    const sig = setupSignatureOf(parsed);
    if (sig === lastSetupSigRef.current) return;
    lastSetupSigRef.current = sig;
    onSetupChangeRef.current?.(parsed);
  }, [parsed]);

  const notional =
    marginUsdt != null && leverage > 0 ? marginUsdt * leverage : null;

  const rows: PlanRow[] = [
    {
      key: 'entryPrice',
      label: vi.recommend.entry,
      color: COLORS.textPrimary,
      hint: vi.recommend.entryHint,
    },
    {
      key: 'stopLoss',
      label: vi.recommend.sl,
      color: COLORS.bearish,
      hint: vi.recommend.slHint,
    },
    {
      key: 'takeProfit1',
      label: vi.recommend.tp(1),
      color: COLORS.bullish,
      hint: vi.recommend.tpHint(1),
    },
    {
      key: 'takeProfit2',
      label: vi.recommend.tp(2),
      color: COLORS.bullish,
      hint: vi.recommend.tpHint(2),
    },
    {
      key: 'takeProfit3',
      label: vi.recommend.tp(3),
      color: COLORS.bullish,
      hint: vi.recommend.tpHint(3),
    },
  ];

  const setField = (key: PriceField, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const blurField = (key: PriceField) => {
    setFields((prev) => {
      const parsedVal = parsePriceInput(symbol, prev[key]);
      if (parsedVal == null) return prev;
      return { ...prev, [key]: formatPrice(symbol, parsedVal) };
    });
  };

  const blurMargin = () => {
    const parsedMargin = parseUsdtInput(marginText);
    if (parsedMargin != null) setMarginText(formatUsdt(parsedMargin));
  };

  return (
    <View style={[styles.wrap, { borderColor: dirColor }]}>
      <View style={[styles.headBar, { backgroundColor: `${dirColor}18` }]}>
        <View style={styles.headLeft}>
          <Text style={styles.headTitle}>{vi.recommend.title}</Text>
          <Text style={styles.headSub}>{vi.recommend.subtitle}</Text>
          {plan.entryReason ? (
            <Text style={styles.entryReason}>{vi.recommend.entryReason(plan.entryReason)}</Text>
          ) : null}
          {plan.marketPrice != null && Number.isFinite(plan.marketPrice) ? (
            <Text style={styles.markLine}>
              {vi.recommend.entryVsMark(
                formatUsdPrice(symbol, plan.entryPrice),
                formatUsdPrice(symbol, plan.marketPrice),
                `${Math.abs(((plan.entryPrice - plan.marketPrice) / plan.marketPrice) * 100).toFixed(2)}%`,
              )}
            </Text>
          ) : null}
        </View>
        <View style={[styles.dirBadge, { backgroundColor: `${dirColor}22`, borderColor: dirColor }]}>
          <Text style={[styles.dirText, { color: dirColor }]}>
            {base}/USDT · {isLong ? vi.signalBoard.long : vi.signalBoard.short}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => setShowDetail((v) => !v)}
        style={[styles.detailToggle, webPointer]}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetail }}
      >
        <Text style={styles.detailToggleText}>
          {showDetail ? vi.recommend.hideDetail : vi.recommend.showDetail}
        </Text>
        <Text style={styles.detailChevron}>{showDetail ? '▲' : '▼'}</Text>
      </Pressable>

      {!showDetail ? (
        <Text style={styles.collapsedSummary}>
          {vi.recommend.collapsedSummary(
            formatUsdPrice(symbol, plan.entryPrice),
            formatUsdPrice(symbol, plan.stopLoss),
            marginUsdt != null ? `$${formatUsdt(marginUsdt)}` : marginText || '—',
            leverage,
          )}
        </Text>
      ) : null}

      {showDetail ? (
        <>
      {plan.entryZone ? (
        <TradePlanView symbol={symbol} direction={direction} plan={plan} />
      ) : null}

      <View style={styles.capitalSection}>
        <Text style={styles.sectionLabel}>{vi.recommend.capitalSection}</Text>

        <View style={styles.capitalRow}>
          <View style={styles.cellParam}>
            <Text style={styles.paramLabel}>{vi.recommend.marginLabel}</Text>
            <Text style={styles.paramHint}>{vi.recommend.marginHint}</Text>
          </View>
          <View style={styles.cellPrice}>
            <TextInput
              value={marginText}
              onChangeText={setMarginText}
              onBlur={blurMargin}
              keyboardType="decimal-pad"
              inputMode="decimal"
              selectTextOnFocus
              style={[styles.priceInput, marginInvalid && styles.priceInputInvalid]}
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={[styles.pricePreview, marginInvalid && styles.pricePreviewInvalid]}>
              {marginInvalid
                ? vi.recommend.invalidMargin
                : marginUsdt != null
                  ? `$${formatUsdt(marginUsdt)}`
                  : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.leverageBlock}>
          <View style={styles.leverageHead}>
            <Text style={styles.paramLabel}>{vi.recommend.leverageLabel}</Text>
            <Text style={styles.leverageValue}>{leverage}x</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_LEVERAGE}
            maximumValue={MAX_LEVERAGE}
            step={1}
            value={leverage}
            onValueChange={(v) => setLeverage(Math.round(v))}
            minimumTrackTintColor={COLORS.accent}
            maximumTrackTintColor={COLORS.border}
            thumbTintColor={COLORS.accent}
          />
          <View style={styles.leverageScale}>
            <Text style={styles.scaleText}>1x</Text>
            <Text style={styles.scaleText}>50x</Text>
          </View>
          {notional != null ? (
            <Text style={styles.notionalHint}>
              {vi.recommend.notionalHint(marginUsdt!, leverage, notional)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.resetRow}>
        <Pressable
          onPress={() => setFields(planToFields(plan, symbol))}
          style={[styles.resetBtn, webPointer]}
        >
          <Text style={styles.resetText}>{vi.recommend.resetSuggested}</Text>
        </Pressable>
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.colHeadText, styles.colHeadParam]}>{vi.recommend.colParam}</Text>
        <Text style={[styles.colHeadText, styles.colHeadPrice]}>{vi.recommend.colPrice}</Text>
      </View>

      {rows.map((row, idx) => {
        const raw = fields[row.key];
        const num = parsePriceInput(symbol, raw);
        const invalid = raw.trim().length > 0 && num == null;

        return (
          <View
            key={row.key}
            style={[
              styles.row,
              idx === rows.length - 1 && styles.rowLast,
              row.key === 'entryPrice' && styles.rowEntry,
            ]}
          >
            <View style={styles.cellParam}>
              <Text style={styles.paramLabel}>{row.label}</Text>
              {row.hint ? <Text style={styles.paramHint}>{row.hint}</Text> : null}
            </View>
            <View style={styles.cellPrice}>
              <TextInput
                value={raw}
                onChangeText={(t) => setField(row.key, t)}
                onBlur={() => blurField(row.key)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                selectTextOnFocus
                style={[
                  styles.priceInput,
                  { color: row.color },
                  invalid && styles.priceInputInvalid,
                ]}
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={[styles.pricePreview, invalid && styles.pricePreviewInvalid]}>
                {invalid
                  ? vi.recommend.invalidPrice
                  : num != null
                    ? formatUsdPrice(symbol, num)
                    : '—'}
              </Text>
            </View>
          </View>
        );
      })}

      <Text style={styles.footer}>{vi.recommend.footer}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
  },
  headBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headLeft: {
    flex: 1,
    gap: 2,
  },
  headTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  headSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  entryReason: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    marginTop: 4,
  },
  markLine: {
    fontSize: 9,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  dirBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  dirText: {
    fontSize: 11,
    fontWeight: '800',
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  detailToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailChevron: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
  collapsedSummary: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontVariant: ['tabular-nums'],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  capitalSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  capitalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  leverageBlock: {
    gap: 4,
    marginTop: 2,
  },
  leverageHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leverageValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'],
  },
  slider: {
    width: '100%',
    height: 32,
  },
  leverageScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  scaleText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  notionalHint: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  resetRow: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 2,
    alignItems: 'flex-end',
  },
  resetBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  resetText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
  },
  tableHead: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  colHeadText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colHeadParam: {
    flex: 1.2,
    minWidth: 0,
  },
  colHeadPrice: {
    flex: 1,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowEntry: {
    backgroundColor: 'rgba(240, 185, 11, 0.06)',
  },
  cellParam: {
    flex: 1.2,
    minWidth: 0,
    paddingRight: 4,
  },
  cellPrice: {
    flex: 1,
    minWidth: 108,
    alignItems: 'flex-end',
    gap: 2,
  },
  paramLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  paramHint: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 12,
  },
  priceInput: {
    width: '100%',
    maxWidth: 140,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
  },
  priceInputInvalid: {
    borderColor: COLORS.bearish,
  },
  pricePreview: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  pricePreviewInvalid: {
    color: COLORS.bearish,
  },
  footer: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    fontStyle: 'italic',
  },
});
