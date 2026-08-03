import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useV41TradeSessionStore } from '../../store/useV41TradeSessionStore';
import type { V41TradeSession } from './v41Rc3Types';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

const COLS = [
  'Coin',
  'Side',
  'Trigger',
  'Status',
  'Entry',
  'Current',
  'PnL',
  'Advisor',
  'Stop',
  'TP',
  'Holding Time',
  'Action',
] as const;

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function formatPnl(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatHolding(openedAt: number, now: number): string {
  const ms = Math.max(0, now - openedAt);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatAdvisorClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function statusColor(status: V41TradeSession['status']): string {
  switch (status) {
    case 'Running':
      return COLORS.bullish;
    case 'Pending':
      return COLORS.warning;
    case 'TP Hit':
      return '#22C55E';
    case 'SL Hit':
      return COLORS.bearish;
    case 'Closed':
      return COLORS.textMuted;
    default:
      return COLORS.textSecondary;
  }
}

function advisorColor(state: V41TradeSession['advisor']): string {
  switch (state) {
    case 'Close':
      return COLORS.bearish;
    case 'Move SL':
    case 'Scale Out':
      return COLORS.warning;
    case 'Hold':
      return COLORS.bullish;
    case 'Waiting Fill':
    default:
      return COLORS.textMuted;
  }
}

function AdvisorCell({ session }: { session: V41TradeSession }) {
  return (
    <View style={styles.advisorCell}>
      <Text style={[styles.advisorState, { color: advisorColor(session.advisor) }]}>
        {session.advisor}
      </Text>
      <Text style={styles.advisorReason} numberOfLines={2}>
        {session.advisorReason || '—'}
      </Text>
      <Text style={styles.advisorUpdated}>
        Updated {formatAdvisorClock(session.advisorUpdatedAt)}
      </Text>
    </View>
  );
}

function SessionRow({
  session,
  now,
  onEnd,
}: {
  session: V41TradeSession;
  now: number;
  onEnd: (id: string) => void;
}) {
  const actionColor = session.action === 'LONG' ? COLORS.bullish : COLORS.bearish;

  return (
    <View style={styles.row}>
      <Text style={[styles.cell, styles.colCoin]}>{session.displayName}</Text>
      <Text style={[styles.cell, styles.colAction, { color: actionColor }]}>
        {session.action}
      </Text>
      <Text style={[styles.cell, styles.colTrigger]}>
        {session.triggerType ?? '—'}
      </Text>
      <Text style={[styles.cell, styles.colStatus, { color: statusColor(session.status) }]}>
        {session.status}
      </Text>
      <Text style={[styles.cell, styles.colNum]}>{formatPrice(session.entry)}</Text>
      <Text style={[styles.cell, styles.colNum]}>{formatPrice(session.current)}</Text>
      <Text style={[styles.cell, styles.colNum]}>{formatPnl(session.pnl)}</Text>
      <View style={[styles.cell, styles.colAdvisor]}>
        <AdvisorCell session={session} />
      </View>
      <Text style={[styles.cell, styles.colNum]}>{formatPrice(session.stop)}</Text>
      <Text style={[styles.cell, styles.colNum]}>{formatPrice(session.tp)}</Text>
      <Text style={[styles.cell, styles.colHold]}>{formatHolding(session.openedAt, now)}</Text>
      <View style={[styles.cell, styles.colAct]}>
        <Pressable
          onPress={() => onEnd(session.id)}
          style={({ pressed }) => [styles.endBtn, pressed && styles.pressed, webPointer]}
        >
          <Text style={styles.endBtnText}>Đóng</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SessionMobileCard({
  session,
  now,
  onEnd,
}: {
  session: V41TradeSession;
  now: number;
  onEnd: (id: string) => void;
}) {
  const actionColor = session.action === 'LONG' ? COLORS.bullish : COLORS.bearish;
  return (
    <View style={styles.mobileCard}>
      <View style={styles.mobileHeader}>
        <Text style={styles.mobileCoin}>{session.displayName}</Text>
        <Text style={{ color: actionColor, fontWeight: '800' }}>{session.action}</Text>
      </View>
      <Text style={styles.mobileMeta}>Trigger: {session.triggerType ?? '—'}</Text>
      <Text style={{ color: statusColor(session.status), fontWeight: '700' }}>
        {session.status}
      </Text>
      <View style={styles.mobileAdvisor}>
        <AdvisorCell session={session} />
      </View>
      <Text style={styles.mobileMeta}>
        Entry {formatPrice(session.entry)} · Cur {formatPrice(session.current)} · PnL{' '}
        {formatPnl(session.pnl)}
      </Text>
      <Text style={styles.mobileMeta}>
        SL {formatPrice(session.stop)} · TP {formatPrice(session.tp)} ·{' '}
        {formatHolding(session.openedAt, now)}
      </Text>
      <Pressable
        onPress={() => onEnd(session.id)}
        style={({ pressed }) => [styles.endBtn, pressed && styles.pressed, webPointer]}
      >
        <Text style={styles.endBtnText}>Đóng</Text>
      </Pressable>
    </View>
  );
}

export function V41ExecutionMonitor() {
  const sessions = useV41TradeSessionStore((s) => s.sessions);
  const endSession = useV41TradeSessionStore((s) => s.endSession);
  const { isMobile } = useResponsiveLayout();
  const now = Date.now();

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Execution Monitor</Text>
        <Text style={styles.subtitle}>
          Position Adviser · chỉ quản lý Trade Session V4.1
        </Text>
      </View>

      {sessions.length === 0 ? (
        <Text style={styles.empty}>Chưa có Trade Session V4.1.</Text>
      ) : isMobile ? (
        <View style={styles.mobileList}>
          {sessions.map((session) => (
            <SessionMobileCard
              key={session.id}
              session={session}
              now={now}
              onEnd={endSession}
            />
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.headRow}>
              {COLS.map((col) => (
                <Text key={col} style={[styles.headCell, colWidth(col)]}>
                  {col}
                </Text>
              ))}
            </View>
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                now={now}
                onEnd={endSession}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function colWidth(col: (typeof COLS)[number]) {
  switch (col) {
    case 'Coin':
      return styles.colCoin;
    case 'Side':
      return styles.colAction;
    case 'Trigger':
      return styles.colTrigger;
    case 'Status':
      return styles.colStatus;
    case 'Advisor':
      return styles.colAdvisor;
    case 'Holding Time':
      return styles.colHold;
    case 'Action':
      return styles.colAct;
    default:
      return styles.colNum;
  }
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  header: {
    gap: 2,
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
  empty: {
    fontSize: 13,
    color: COLORS.textMuted,
    paddingVertical: SPACING.lg,
  },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  headCell: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  cell: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  colCoin: { width: 64 },
  colAction: { width: 64 },
  colTrigger: { width: 120 },
  colStatus: { width: 80 },
  colNum: { width: 88 },
  colAdvisor: { width: 168 },
  colHold: { width: 88 },
  colAct: { width: 72 },
  advisorCell: {
    gap: 2,
    paddingRight: SPACING.xs,
  },
  advisorState: {
    fontSize: 12,
    fontWeight: '800',
  },
  advisorReason: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    lineHeight: 15,
  },
  advisorUpdated: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  endBtn: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  endBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  pressed: { opacity: 0.8 },
  mobileList: { gap: SPACING.sm },
  mobileCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  mobileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileCoin: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  mobileMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  mobileAdvisor: {
    marginVertical: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
  },
});
