import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, TRADE_SYMBOLS, type AppTradeSymbol } from '../../constants/scoring';
import { RADIUS } from '../../constants/theme';
import { symbolIconChar, symbolLabelVi, vi } from '../../constants/vi';

interface SymbolPickerProps {
  selected: AppTradeSymbol;
  onSelect: (symbol: AppTradeSymbol) => void;
}

const SYMBOL_META: Record<AppTradeSymbol, { color: string }> = {
  BTCUSDT: { color: '#F7931A' },
  NEARUSDT: { color: '#00C08B' },
  SOLUSDT: { color: '#9945FF' },
  BNBUSDT: { color: '#F0B90B' },
  XRPUSDT: { color: '#23292F' },
  ETHUSDT: { color: '#627EEA' },
  LINKUSDT: { color: '#2A5ADA' },
  AVAXUSDT: { color: '#E84142' },
};

function splitPair(symbol: AppTradeSymbol) {
  return { base: symbol.replace('USDT', ''), quote: 'USDT' };
}

export function SymbolPicker({ selected, onSelect }: SymbolPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 168 });
  const triggerRef = useRef<View>(null);
  const { base, quote } = splitPair(selected);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPos({ top: y + height + 4, left: x, width: Math.max(width, 168) });
      setOpen(true);
    });
  };

  const pick = (sym: AppTradeSymbol) => {
    onSelect(sym);
    setOpen(false);
  };

  return (
    <>
      <View ref={triggerRef} collapsable={false} style={styles.wrap}>
        <Pressable
          onPress={openMenu}
          style={styles.trigger}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <View style={styles.triggerLeft}>
            <View style={[styles.icon, { backgroundColor: SYMBOL_META[selected].color }]}>
              <Text style={styles.iconText}>{symbolIconChar(base)}</Text>
            </View>
            <View>
              <View style={styles.pairRow}>
                <Text style={styles.pairBase}>{base}</Text>
                <Text style={styles.pairSlash}>/</Text>
                <Text style={styles.pairQuote}>{quote}</Text>
              </View>
              <Text style={styles.perpTag}>{vi.symbols.perpetual}</Text>
            </View>
          </View>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.menu,
              { top: menuPos.top, left: menuPos.left, minWidth: menuPos.width },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {TRADE_SYMBOLS.map((sym) => {
              const active = sym === selected;
              const { base: b, quote: q } = splitPair(sym);
              return (
                <Pressable
                  key={sym}
                  onPress={() => pick(sym)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={styles.optionLeft}>
                    <View
                      style={[styles.icon, styles.iconSm, { backgroundColor: SYMBOL_META[sym].color }]}
                    >
                      <Text style={styles.iconTextSm}>{symbolIconChar(b)}</Text>
                    </View>
                    <Text style={styles.optionPair}>
                      <Text style={[styles.optionBase, active && styles.optionBaseActive]}>
                        {symbolLabelVi(sym)}
                      </Text>
                      <Text style={styles.optionQuote}>/{q}</Text>
                    </Text>
                  </View>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    minWidth: 148,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSm: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  iconText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.background,
  },
  iconTextSm: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.background,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  pairBase: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  pairSlash: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginHorizontal: 1,
  },
  pairQuote: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  perpTag: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.accent,
    marginTop: 1,
    letterSpacing: 0.3,
  },
  chevron: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionActive: {
    backgroundColor: 'rgba(240, 185, 11, 0.08)',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionPair: {
    fontSize: 13,
  },
  optionBase: {
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  optionBaseActive: {
    color: COLORS.accent,
  },
  optionQuote: {
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  check: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
