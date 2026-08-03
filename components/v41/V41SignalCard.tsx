import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import type { V41Rc3SignalCardModel } from './v41Rc3Types';

/** Shown under TP2/TP3 when levels mirror TP1 for Confirm B breakout cards. */
export const BREAKOUT_TP_MIRROR_NOTE = 'TP1 only · 1.5R';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

function formatNum(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** Format HH:mm:ss từ timestamp Market Snapshot — không tạo timestamp mới. */
function formatScanClock(fetchedAt: number): string {
  const d = new Date(fetchedAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatScanAge(fetchedAt: number, nowMs: number): string {
  const ageSec = Math.max(0, Math.floor((nowMs - fetchedAt) / 1000));
  return `${ageSec}s`;
}

type Props = {
  card: V41Rc3SignalCardModel;
  loading?: boolean;
  actionDisabled?: boolean;
  /** Đồng hồ UI hiện tại khi render — Age = now − fetchedAt (snapshot). */
  nowMs?: number;
  onLong?: () => void;
  onShort?: () => void;
};

export function V41SignalCard({
  card,
  loading = false,
  actionDisabled = false,
  nowMs = Date.now(),
  onLong,
  onShort,
}: Props) {
  const { signalCardLayout } = useResponsiveLayout();
  const gate = card.gate;
  const gateActive = gate?.activeEligible === true;
  const signalsPassed = gate?.signalsPassed ?? card.checklist.filter((c) => c.passed).length;
  const signalsRequired = gate?.signalsRequired ?? 3;
  const signalsTotal = gate?.signalsTotal ?? card.checklist.length;
  const confidenceTr = gate?.confidenceTr ?? null;
  const confidenceMin = gate?.confidenceMin ?? 50;
  const showLevels = !loading && card.levels != null;
  const showAction =
    !loading &&
    (card.decision === 'LONG' || card.decision === 'SHORT') &&
    card.levels != null;

  const decisionColor =
    card.decision === 'LONG'
      ? COLORS.bullish
      : card.decision === 'SHORT'
        ? COLORS.bearish
        : COLORS.textMuted;

  const fetchedAt =
    card.fetchedAt != null && Number.isFinite(card.fetchedAt) ? card.fetchedAt : null;

  const confTrLabel =
    confidenceTr != null && Number.isFinite(confidenceTr)
      ? `${Math.round(confidenceTr)}/${confidenceMin} cần thiết`
      : `—/${confidenceMin} cần thiết`;
  const confTrOk = gate?.confidenceMet === true;

  return (
    <View style={[styles.card, signalCardLayout, loading && styles.cardUpdating]}>
      <View style={styles.header}>
        <Text style={styles.coin}>{card.displayName}</Text>
        <View style={[styles.decisionPill, { borderColor: decisionColor }]}>
          <Text style={[styles.decisionText, { color: decisionColor }]}>
            {loading ? '…' : card.decision}
          </Text>
        </View>
      </View>

      <View style={styles.scanMeta}>
        <Text style={styles.scanLine}>
          Last Scan:{' '}
          <Text style={styles.scanValue}>
            {fetchedAt != null ? formatScanClock(fetchedAt) : '—'}
          </Text>
        </Text>
        <Text style={styles.scanLine}>
          Age:{' '}
          <Text style={styles.scanValue}>
            {fetchedAt != null ? formatScanAge(fetchedAt, nowMs) : '—'}
          </Text>
        </Text>
      </View>

      {loading ? (
        <View style={styles.updatingBox}>
          <Text style={styles.updatingText}>Updating...</Text>
        </View>
      ) : (
        <>
          <Text style={styles.metaLabel}>Loại Trigger</Text>
          <Text style={styles.triggerValue}>{card.triggerType ?? '—'}</Text>

          <Text style={styles.metaLabel}>Confidence TR</Text>
          <Text
            style={[
              styles.confidenceValue,
              confTrOk ? styles.checkPass : styles.checkFail,
            ]}
          >
            {confTrLabel}
          </Text>

          <Text style={styles.sectionTitle}>
            {gateActive
              ? 'Gate ACTIVE đạt (≥3/4 + conf)'
              : 'Thiếu gì (cần ≥3/4 + conf)'}
          </Text>
          <Text style={styles.gateSummary}>
            {signalsPassed}/{signalsTotal} điều kiện đạt (cần ≥{signalsRequired}/{signalsTotal})
          </Text>
          <View style={styles.checklist}>
            {card.checklist.map((item) => (
              <Text
                key={item.id}
                style={[
                  styles.checkItem,
                  item.passed ? styles.checkPass : styles.checkFail,
                ]}
              >
                {item.passed ? '✓' : '✗'} {item.label}
              </Text>
            ))}
          </View>

          {showLevels && card.levels ? (
            <View style={styles.levelsBox}>
              <LevelRow label="Entry" value={formatNum(card.levels.entry)} />
              <LevelRow label="Stop" value={formatNum(card.levels.stop)} />
              <LevelRow label="TP1" value={formatNum(card.levels.tp1)} />
              <LevelRow label="TP2" value={formatNum(card.levels.tp2)} />
              <LevelRow label="TP3" value={formatNum(card.levels.tp3)} />
              {card.triggerType === 'Breakout Confirmed' ? (
                <Text
                  testID="breakout-tp-mirror-note"
                  style={styles.breakoutTpNote}
                >
                  {BREAKOUT_TP_MIRROR_NOTE}
                </Text>
              ) : null}
              <LevelRow label="RR" value={formatNum(card.levels.rr, 1)} />
            </View>
          ) : null}

          {showAction ? (
            <View style={styles.actions}>
              {card.decision === 'LONG' ? (
                <Pressable
                  disabled={actionDisabled}
                  onPress={onLong}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.longBtn,
                    actionDisabled && styles.actionDisabled,
                    pressed && !actionDisabled && styles.pressed,
                    webPointer,
                  ]}
                >
                  <Text style={styles.actionBtnText}>
                    {actionDisabled ? 'LONG · đang mở' : 'LONG'}
                  </Text>
                </Pressable>
              ) : null}
              {card.decision === 'SHORT' ? (
                <Pressable
                  disabled={actionDisabled}
                  onPress={onShort}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.shortBtn,
                    actionDisabled && styles.actionDisabled,
                    pressed && !actionDisabled && styles.pressed,
                    webPointer,
                  ]}
                >
                  <Text style={styles.actionBtnText}>
                    {actionDisabled ? 'SHORT · đang mở' : 'SHORT'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function LevelRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.levelRow}>
      <Text style={styles.levelLabel}>{label}</Text>
      <Text style={styles.levelValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  cardUpdating: {
    borderColor: COLORS.warning,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  coin: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },
  decisionPill: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  decisionText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  scanMeta: {
    gap: 2,
    marginBottom: SPACING.xs,
  },
  scanLine: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  scanValue: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  updatingBox: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatingText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.warning,
    letterSpacing: 0.4,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: SPACING.xs,
  },
  triggerValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  confidenceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: SPACING.sm,
  },
  gateSummary: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 2,
  },
  checklist: {
    gap: 4,
    marginTop: 2,
  },
  checkItem: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  checkPass: {
    color: COLORS.bullish,
  },
  checkFail: {
    color: COLORS.bearish,
  },
  levelsBox: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: 4,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  levelLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  levelValue: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  breakoutTpNote: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 2,
  },
  actions: {
    marginTop: SPACING.md,
  },
  actionBtn: {
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  longBtn: {
    backgroundColor: COLORS.bullish,
  },
  shortBtn: {
    backgroundColor: COLORS.bearish,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  pressed: {
    opacity: 0.85,
  },
});
