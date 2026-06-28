import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { COLORS } from '../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../constants/theme';
import { computeTradePnl } from '../services/journalService';
import { useTradeStore } from '../store/useTradeStore';
import { formatUsdPrice } from '../utils/formatPrice';
import { formatSignedUsdt } from '../utils/positionPnl';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface OpenTradeBannerProps {
  entry: AiTradeJournalEntry;
  markPrice?: number | null;
  onCloseTrade?: () => void;
  onGoJournal?: () => void;
}

export function OpenTradeBanner({
  entry,
  markPrice,
  onCloseTrade,
  onGoJournal,
}: OpenTradeBannerProps) {
  const leverage = useTradeStore((s) => s.settings.leverage) ?? 5;
  const sym = entry.symbol as import('../constants/scoring').AppTradeSymbol;
  const price = markPrice ?? entry.market.entryPrice;
  const { pnlUSDT } = computeTradePnl(entry, price, leverage);
  const pnlColor = pnlUSDT >= 0 ? COLORS.bullish : COLORS.bearish;

  return (
    <View style={styles.banner}>
      <View style={styles.textCol}>
        <Text style={styles.title}>
          ⏳ Lệnh đang mở · {entry.symbol.replace('USDT', '')} {entry.scoring.direction}
        </Text>
        <Text style={styles.meta}>
          Entry {formatUsdPrice(sym, entry.market.entryPrice)}
          {markPrice != null ? ` · Mark ${formatUsdPrice(sym, markPrice)}` : ''}
        </Text>
        <Text style={[styles.pnl, { color: pnlColor }]}>
          P&L ước tính: {formatSignedUsdt(pnlUSDT)}
        </Text>
      </View>
      <View style={styles.actions}>
        {onGoJournal ? (
          <Pressable onPress={onGoJournal} style={[styles.btn, styles.secondary, webPointer]}>
            <Text style={styles.secondaryText}>Nhật ký</Text>
          </Pressable>
        ) : null}
        {onCloseTrade ? (
          <Pressable onPress={onCloseTrade} style={[styles.btn, styles.primary, webPointer]}>
            <Text style={styles.primaryText}>Đóng lệnh</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    ...PANEL,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    padding: SPACING.md,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(14, 203, 129, 0.08)',
    marginBottom: SPACING.md,
  },
  textCol: { flex: 1, minWidth: 200 },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  meta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  pnl: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  btn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  secondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  secondaryText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  primary: {
    backgroundColor: COLORS.accent,
  },
  primaryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#02110A',
  },
});
