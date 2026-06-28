import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS, SCORER_LAYER_NAMES, type ScorerLayerId } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { calculateEntryQuality, resolveJournalCloseReasonDisplay, resolveJournalDisplayStatus, resolveJournalOpenReasonDisplay } from '../../services/journalService';
import {
  getRecommendationLogForTrade,
  type RecommendationLogEntry,
} from '../../services/recommendationLogService';
import { formatUsdPrice } from '../../utils/formatPrice';
import { formatSignedUsdt } from '../../utils/positionPnl';
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface JournalEntryDetailProps {
  entry: AiTradeJournalEntry | null;
  visible: boolean;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function JournalEntryDetail({ entry, visible, onClose }: JournalEntryDetailProps) {
  const [recLog, setRecLog] = useState<RecommendationLogEntry[]>([]);

  useEffect(() => {
    if (!entry || entry.outcome.status === 'OPEN' || entry.outcome.status === 'PENDING') {
      setRecLog([]);
      return;
    }
    void getRecommendationLogForTrade(entry.id).then(setRecLog);
  }, [entry?.id, entry?.outcome.status]);

  if (!entry) return null;
  const sym = entry.symbol as import('../../constants/scoring').AppTradeSymbol;
  const quality = calculateEntryQuality(entry);
  const layers = Object.entries(entry.scoring.layerScores) as Array<[string, number]>;
  const openReasonLabel = resolveJournalOpenReasonDisplay(entry);
  const closeReasonLabel = resolveJournalCloseReasonDisplay(entry);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Chi tiết lệnh</Text>
          <Pressable onPress={onClose} style={webPointer}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.section}>Thị trường</Text>
          <Row label="Entry thực tế" value={formatUsdPrice(sym, entry.market.entryPrice)} />
          <Row label="Giá phân tích" value={formatUsdPrice(sym, entry.market.priceAtAnalysis)} />
          <Row label="Slippage" value={`${entry.market.slippage}%`} />
          <Row label="CVD" value={`${entry.market.cvdValue} (${entry.market.cvdTrend})`} />
          <Row label="BTC 24h" value={`${entry.market.btcChangePct}%`} />
          <Row label="Funding" value={`${entry.market.fundingRate}%`} />
          <Row label="L/S Ratio" value={String(entry.market.topLSRatio)} />
          <Row label="Phiên" value={`${entry.market.sessionType} · ${entry.market.hourVN}h VN`} />

          <Text style={styles.section}>Chấm điểm</Text>
          <Row label="Tổng điểm" value={`${entry.scoring.totalScore} · ${entry.scoring.decision}`} />
          {layers.map(([k, v]) => {
            const n = Number(k.replace('l', '')) as ScorerLayerId;
            const name = SCORER_LAYER_NAMES[n] ?? k;
            return <Row key={k} label={`${k.toUpperCase()} ${name}`} value={String(v)} />;
          })}

          <Text style={styles.section}>Kế hoạch</Text>
          <Row label="Zone" value={entry.plan.entryZoneType} />
          <Row label="Optimal" value={formatUsdPrice(sym, entry.plan.entryZoneOptimal)} />
          <Row label="SL" value={`${formatUsdPrice(sym, entry.plan.slProposed)} → ${formatUsdPrice(sym, entry.plan.slActual)}`} />
          <Row label="TP1" value={formatUsdPrice(sym, entry.plan.tp1Actual)} />
          <Row label="Size" value={`$${entry.plan.sizeActual}`} />
          <Row label="Entry quality" value={`${quality.score}/100 · ${quality.assessment}`} />
          {openReasonLabel ? <Row label="Lý do vào" value={openReasonLabel} /> : null}

          <Text style={styles.section}>Kết quả</Text>
          <Row label="Status" value={resolveJournalDisplayStatus(entry.outcome.status)} />
          {entry.outcome.exitPrice != null ? (
            <Row label="Exit" value={formatUsdPrice(sym, entry.outcome.exitPrice)} />
          ) : null}
          {entry.outcome.pnlUSDT != null ? (
            <Row label="PnL" value={formatSignedUsdt(entry.outcome.pnlUSDT)} />
          ) : null}
          {entry.outcome.holdingTimeMinutes != null ? (
            <Row label="Giữ" value={`${entry.outcome.holdingTimeMinutes} phút`} />
          ) : null}
          {closeReasonLabel ? <Row label="Lý do đóng" value={closeReasonLabel} /> : null}
          {entry.outcome.offlineClose ? (
            <Row label="Offline" value="Có" />
          ) : null}
          {entry.outcome.notes ? <Row label="Notes" value={entry.outcome.notes} /> : null}

          {recLog.length > 0 ? (
            <View style={styles.recLogSection}>
              <Text style={styles.recLogTitle}>📜 Lịch sử khuyến nghị</Text>
              {recLog.map((log) => (
                <View key={log.id} style={styles.recLogRow}>
                  <Text style={styles.recLogTime}>
                    {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                  </Text>
                  <Text style={styles.recLogLabel}>{log.label}</Text>
                  <Text style={styles.recLogScore}>
                    {log.scoreSnapshot.totalScore.toFixed(1)}đ
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  close: {
    fontSize: 18,
    color: COLORS.textMuted,
    padding: 4,
  },
  body: {
    padding: SPACING.lg,
    paddingBottom: 40,
  },
  section: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
  rowValue: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'right',
    flex: 1,
  },
  recLogSection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  recLogTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  recLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  recLogTime: {
    fontSize: 10,
    color: COLORS.textMuted,
    width: 72,
  },
  recLogLabel: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textPrimary,
  },
  recLogScore: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.accent,
  },
});