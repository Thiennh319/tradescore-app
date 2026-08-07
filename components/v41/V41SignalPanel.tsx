import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import type { SignalRowV41 } from '../../services/v41/scanV41';
import {
  runV41MarketIntelligenceExport,
  runV41PairedMiRulebookExport,
  runV41RulebookExport,
  V41_PANEL_EXPORT_OPTIONS,
  v41PanelExportLabel,
  type V41PanelExportKind,
} from '../../services/v41Export';
import { symbolDisplayName, type V41Rc3SignalCardModel } from './v41Rc3Types';
import { V41SignalCard } from './V41SignalCard';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

const COIN_DOT: Record<string, string> = {
  BTCUSDT: '#F7931A',
  SOLUSDT: '#9945FF',
  BNBUSDT: '#F0B90B',
  NEARUSDT: '#00C08B',
};

type Props = {
  cards: V41Rc3SignalCardModel[];
  /** Scan rows — dùng lookup khi Export (copy-only). */
  rows?: readonly SignalRowV41[];
  loading?: boolean;
  lockedSymbols?: ReadonlySet<string>;
  nowMs?: number;
  onOpenLong: (card: V41Rc3SignalCardModel) => void;
  onOpenShort: (card: V41Rc3SignalCardModel) => void;
};

export function V41SignalPanel({
  cards,
  rows = [],
  loading = false,
  lockedSymbols,
  nowMs,
  onOpenLong,
  onOpenShort,
}: Props) {
  const { isMobile } = useResponsiveLayout();

  const coinOptions = useMemo(() => {
    if (cards.length > 0) return cards.map((c) => c.symbol);
    return rows.map((r) => r.symbol);
  }, [cards, rows]);

  const [selectedCoin, setSelectedCoin] = useState<string>(
    () => coinOptions[0] ?? 'BTCUSDT',
  );
  const [selectedExportKind, setSelectedExportKind] =
    useState<V41PanelExportKind>('marketIntelligence');
  const [coinMenuOpen, setCoinMenuOpen] = useState(false);
  const [kindMenuOpen, setKindMenuOpen] = useState(false);
  const [coinMenuPos, setCoinMenuPos] = useState({ top: 0, right: 0, width: 200 });
  const [kindMenuPos, setKindMenuPos] = useState({ top: 0, right: 0, width: 220 });
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const coinTriggerRef = useRef<View>(null);
  const kindTriggerRef = useRef<View>(null);

  useEffect(() => {
    if (coinOptions.length === 0) return;
    if (!coinOptions.includes(selectedCoin)) {
      setSelectedCoin(coinOptions[0]!);
    }
  }, [coinOptions, selectedCoin]);

  const rowAvailable = useMemo(
    () => rows.some((r) => r.symbol === selectedCoin),
    [rows, selectedCoin],
  );
  const selectedKindEnabled =
    V41_PANEL_EXPORT_OPTIONS.find((o) => o.id === selectedExportKind)?.enabled ===
    true;
  const exportDisabled =
    exporting ||
    loading ||
    rows.length === 0 ||
    !rowAvailable ||
    !selectedKindEnabled;

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const openCoinMenu = useCallback(() => {
    setKindMenuOpen(false);
    const screenW = Dimensions.get('window').width;
    coinTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setCoinMenuPos({
        top: y + height + 4,
        right: Math.max(8, screenW - x - width),
        width: Math.max(160, width),
      });
      setCoinMenuOpen(true);
    });
  }, []);

  const openKindMenu = useCallback(() => {
    setCoinMenuOpen(false);
    const screenW = Dimensions.get('window').width;
    kindTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setKindMenuPos({
        top: y + height + 4,
        right: Math.max(8, screenW - x - width),
        width: Math.max(220, width),
      });
      setKindMenuOpen(true);
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (exportDisabled) {
      if (rows.length === 0) {
        showToast('Chưa có dữ liệu scan V4.1 để xuất.');
      } else if (!rowAvailable) {
        showToast(`Không tìm thấy ${selectedCoin} trong dữ liệu scan.`);
      }
      return;
    }
    setExporting(true);
    try {
      if (selectedExportKind === 'miRulebookPair') {
        const paired = await runV41PairedMiRulebookExport(rows, selectedCoin);
        if (!paired.ok) {
          showToast(paired.message);
          return;
        }
        showToast(`✅ Đã xuất ${paired.filenames.join(' + ')}`);
        return;
      }
      const result =
        selectedExportKind === 'rulebook'
          ? await runV41RulebookExport(rows, selectedCoin)
          : await runV41MarketIntelligenceExport(rows, selectedCoin);
      if (!result.ok) {
        showToast(result.message);
        return;
      }
      showToast(`✅ Đã xuất ${result.filename}`);
    } catch {
      showToast('❌ Export thất bại.');
    } finally {
      setExporting(false);
    }
  }, [
    exportDisabled,
    rowAvailable,
    rows,
    selectedCoin,
    selectedExportKind,
    showToast,
  ]);

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Signal Panel</Text>
          <Text style={styles.subtitle}>V4.1 · High-quality triggers only</Text>
        </View>

        <View style={styles.auditExportWrap}>
          <View ref={coinTriggerRef} collapsable={false}>
            <Pressable
              onPress={openCoinMenu}
              disabled={exporting || coinOptions.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Chọn coin để Export V4.1"
              accessibilityState={{ expanded: coinMenuOpen }}
              style={({ pressed }) => [
                styles.auditModeBtn,
                coinMenuOpen && styles.auditModeBtnOpen,
                (exporting || coinOptions.length === 0) && styles.exportBtnDisabled,
                pressed && styles.pressed,
                webPointer,
              ]}
            >
              <View
                style={[
                  styles.auditCoinDot,
                  { backgroundColor: COIN_DOT[selectedCoin] ?? COLORS.accent },
                ]}
              />
              <Text style={styles.auditModeBtnText} numberOfLines={1}>
                {symbolDisplayName(selectedCoin)}
              </Text>
              <Text style={styles.auditModeChevron}>▾</Text>
            </Pressable>
          </View>

          <View ref={kindTriggerRef} collapsable={false}>
            <Pressable
              onPress={openKindMenu}
              disabled={exporting}
              accessibilityRole="button"
              accessibilityLabel="Chọn loại Export V4.1"
              accessibilityState={{ expanded: kindMenuOpen }}
              style={({ pressed }) => [
                styles.auditModeBtn,
                kindMenuOpen && styles.auditModeBtnOpen,
                exporting && styles.exportBtnDisabled,
                pressed && styles.pressed,
                webPointer,
              ]}
            >
              <Text style={styles.auditModeBtnText} numberOfLines={1}>
                {v41PanelExportLabel(selectedExportKind)}
              </Text>
              <Text style={styles.auditModeChevron}>▾</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => void handleExport()}
            disabled={exportDisabled}
            accessibilityRole="button"
            accessibilityLabel="Export V4.1 Trace"
            accessibilityState={{ disabled: exportDisabled }}
            style={({ pressed }) => [
              styles.exportBtn,
              exportDisabled && styles.exportBtnDisabled,
              pressed && !exportDisabled && styles.pressed,
              webPointer,
            ]}
          >
            <Text style={styles.exportBtnText}>
              {exporting ? '⏳ Đang xuất...' : '📄 Export'}
            </Text>
          </Pressable>
        </View>
      </View>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <View style={[styles.row, isMobile && styles.rowMobile]}>
        {cards.map((card) => (
          <V41SignalCard
            key={card.symbol}
            card={card}
            loading={loading}
            nowMs={nowMs}
            actionDisabled={lockedSymbols?.has(card.symbol) === true}
            onLong={() => onOpenLong(card)}
            onShort={() => onOpenShort(card)}
          />
        ))}
      </View>

      <Modal
        visible={coinMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCoinMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setCoinMenuOpen(false)}>
          <View
            style={[
              styles.auditMenu,
              { top: coinMenuPos.top, right: coinMenuPos.right, width: coinMenuPos.width },
            ]}
          >
            <ScrollView style={styles.auditMenuScroll}>
              {coinOptions.map((symbol) => {
                const active = symbol === selectedCoin;
                const hasRow = rows.some((r) => r.symbol === symbol);
                return (
                  <Pressable
                    key={symbol}
                    onPress={() => {
                      setSelectedCoin(symbol);
                      setCoinMenuOpen(false);
                    }}
                    style={[
                      styles.auditMenuOption,
                      active && styles.auditMenuOptionActive,
                      webPointer,
                    ]}
                  >
                    <View style={styles.auditCoinOptionLeft}>
                      <View
                        style={[
                          styles.auditCoinDot,
                          { backgroundColor: COIN_DOT[symbol] ?? COLORS.accent },
                        ]}
                      />
                      <Text
                        style={[
                          styles.auditMenuOptionText,
                          active && styles.auditMenuOptionTextActive,
                          !hasRow && styles.auditMenuOptionMuted,
                        ]}
                      >
                        {symbolDisplayName(symbol)}
                        {!hasRow ? ' · chưa scan' : ''}
                      </Text>
                    </View>
                    {active ? <Text style={styles.auditMenuCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={kindMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setKindMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setKindMenuOpen(false)}>
          <View
            style={[
              styles.auditMenu,
              { top: kindMenuPos.top, right: kindMenuPos.right, width: kindMenuPos.width },
            ]}
          >
            <View style={styles.auditMenuHeader}>
              <Text style={styles.auditMenuHeaderText}>Trace (V4.1)</Text>
            </View>
            <ScrollView style={styles.auditMenuScroll}>
              {V41_PANEL_EXPORT_OPTIONS.map((opt) => {
                const active = opt.id === selectedExportKind;
                return (
                  <Pressable
                    key={opt.id}
                    disabled={!opt.enabled}
                    onPress={() => {
                      if (!opt.enabled) return;
                      setSelectedExportKind(opt.id);
                      setKindMenuOpen(false);
                    }}
                    style={[
                      styles.auditMenuOption,
                      active && styles.auditMenuOptionActive,
                      !opt.enabled && styles.auditMenuOptionDisabled,
                      webPointer,
                    ]}
                  >
                    <Text
                      style={[
                        styles.auditMenuOptionText,
                        active && styles.auditMenuOptionTextActive,
                        !opt.enabled && styles.auditMenuOptionMuted,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {active ? <Text style={styles.auditMenuCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  headerText: {
    gap: 2,
    flexShrink: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  auditExportWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  auditModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    maxWidth: 180,
  },
  auditModeBtnOpen: {
    borderColor: 'rgba(240, 185, 11, 0.45)',
  },
  auditModeBtnText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  auditModeChevron: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  auditCoinDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  exportBtnDisabled: {
    opacity: 0.5,
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pressed: {
    opacity: 0.85,
  },
  toast: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toastText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  rowMobile: {
    flexDirection: 'column',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  auditMenu: {
    position: 'absolute',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    maxHeight: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 16,
  },
  auditMenuHeader: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  auditMenuHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  auditMenuScroll: {
    maxHeight: 420,
  },
  auditMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  auditMenuOptionActive: {
    backgroundColor: 'rgba(240, 185, 11, 0.06)',
  },
  auditMenuOptionDisabled: {
    opacity: 0.45,
  },
  auditMenuOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  auditMenuOptionTextActive: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  auditMenuOptionMuted: {
    color: COLORS.textMuted,
  },
  auditMenuCheck: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  auditCoinOptionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
