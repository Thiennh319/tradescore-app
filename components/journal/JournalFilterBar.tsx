import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, type AppTradeSymbol } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export type JournalStatusFilter = 'ALL' | 'OPEN' | 'PENDING' | 'WIN' | 'LOSS' | 'CLOSED';

const SYMBOLS: Array<AppTradeSymbol | 'ALL'> = ['ALL', 'NEARUSDT', 'SOLUSDT', 'BNBUSDT', 'BTCUSDT'];
const STATUS_OPTIONS: Array<{ id: JournalStatusFilter; label: string }> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'OPEN', label: 'Đang mở' },
  { id: 'PENDING', label: 'Chờ fill' },
  { id: 'WIN', label: 'Thắng' },
  { id: 'LOSS', label: 'Thua' },
  { id: 'CLOSED', label: 'Đã đóng' },
];

interface JournalFilterBarProps {
  symbol: AppTradeSymbol | 'ALL';
  status: JournalStatusFilter;
  onSymbolChange: (s: AppTradeSymbol | 'ALL') => void;
  onStatusChange: (s: JournalStatusFilter) => void;
  onExportCsv?: () => void;
}

export function JournalFilterBar({
  symbol,
  status,
  onSymbolChange,
  onStatusChange,
  onExportCsv,
}: JournalFilterBarProps) {
  const { isMobile } = useResponsiveLayout();

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {SYMBOLS.map((sym) => (
          <Pressable
            key={sym}
            onPress={() => onSymbolChange(sym)}
            style={[styles.chip, symbol === sym && styles.chipActive, webPointer]}
          >
            <Text style={[styles.chipText, symbol === sym && styles.chipTextActive]}>
              {sym === 'ALL' ? 'Tất cả' : sym.replace('USDT', '')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={[styles.bottomRow, isMobile && styles.bottomRowMobile]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {STATUS_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => onStatusChange(opt.id)}
              style={[styles.chip, status === opt.id && styles.chipActive, webPointer]}
            >
              <Text style={[styles.chipText, status === opt.id && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {onExportCsv ? (
          <Pressable onPress={onExportCsv} style={[styles.exportBtn, webPointer]}>
            <Text style={styles.exportText}>Xuất CSV</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  row: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bottomRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: SPACING.sm,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(14, 203, 129, 0.12)',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  chipTextActive: { color: COLORS.accent },
  exportBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exportText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent,
  },
});
