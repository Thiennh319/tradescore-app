/**
 * Task 14.6.10 — Pixel-perfect Performance HT polish (golden mockup).
 * Presentation only. No engine / VM / hierarchy / logic changes.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { EquityCurveChart } from '../EquityCurveChart';
import type { DashboardFilterPeriod } from '../../services/intelligence/dashboard/dashboardTypes';
import { buildPerformanceHtDataBundle } from '../../services/performanceHt';
import {
  buildEquityCurveData,
  computeEquityCurveStats,
} from '../../services/journalService';
import { useTradeStore } from '../../store/useTradeStore';
import { vi } from '../../constants/vi';
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};
const UL = vi.ulAnalytics;

/** Mockup palette — Task 14.6.10 pixel polish (slightly stronger contrast). */
const M = {
  page: '#0B0E14',
  card: '#151A22',
  cardBorder: 'rgba(255,255,255,0.06)',
  muted: '#9AA3B5',
  text: '#F1F4FA',
  green: '#1EC95A',
  greenSoft: 'rgba(30,201,90,0.16)',
  red: '#F53B3B',
  redSoft: 'rgba(245,59,59,0.16)',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  amber: '#F59E0B',
  amberSoft: 'rgba(245,158,11,0.18)',
  shadow: 'rgba(0,0,0,0.40)',
  track: '#252A35',
} as const;

/** Task 14.6.10 — pixel-perfect spacing scale. */
const S = {
  gap: 24,
  pad: 28,
  padSm: 16,
  radius: 12,
  radiusSm: 10,
  shadow: '0 0 0 1px rgba(255,255,255,0.02)',
  title: 13,
  label: 11,
  metric: 12,
  axis: 12,
} as const;

const PERIODS: { id: DashboardFilterPeriod; label: string }[] = [
  { id: 'all', label: 'Toàn thời gian' },
  { id: 'month', label: '30 ngày' },
  { id: 'week', label: '7 ngày' },
  { id: 'today', label: 'Hôm nay' },
];

function fmt(n: number | null | undefined, d = 1, s = ''): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(d)}${s}`;
}

function fmtPnl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}

function relativeUpdate(iso: string | undefined): string {
  if (!iso) return 'Cập nhật: —';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'Cập nhật: —';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return 'Cập nhật: vừa xong';
  if (mins < 60) return `Cập nhật: ${mins} phút trước`;
  const h = Math.round(mins / 60);
  if (h < 48) return `Cập nhật: ${h} giờ trước`;
  return `Cập nhật: ${Math.round(h / 24)} ngày trước`;
}

function healthShort(label: string): string {
  switch (label) {
    case 'Excellent':
      return 'Xuất sắc';
    case 'Good':
      return 'Tốt';
    case 'Warning':
      return 'Cảnh báo';
    case 'Critical':
      return 'Nguy cấp';
    default:
      return '—';
  }
}

function healthDesc(label: string): string {
  switch (label) {
    case 'Excellent':
    case 'Good':
      return 'Hệ thống hoạt động ổn định.';
    case 'Warning':
      return 'Cần theo dõi thêm.';
    case 'Critical':
      return 'Nên giảm quy mô giao dịch.';
    default:
      return 'Chưa đủ dữ liệu.';
  }
}

function coinShort(key: string): string {
  return key.replace(/USDT$/i, '');
}

function friendlyTarget(target: string): string {
  const t = target.trim().toLowerCase();
  if (t === 'win' || t.includes('pullback')) return 'PULLBACK';
  if (t === 'long') return 'LONG';
  if (t === 'short') return 'SHORT';
  return coinShort(target);
}

function softReason(reason: string): string {
  let r = reason
    .replace(/Statistics\.?\w*/gi, '')
    .replace(/Tag Intelligence/gi, '')
    .replace(/Tag thắng mạnh.*/gi, 'chiến lược đang hiệu quả')
    .replace(/outperforming/gi, '')
    .replace(/score\s*[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[·|/.\s]+$/g, '')
    .trim();
  return r.length >= 4 ? r : 'Dựa trên kết quả gần đây.';
}

function recHeadline(action: string, target: string): string {
  const c = friendlyTarget(target);
  if (action === 'PRIORITIZE') {
    if (c === 'PULLBACK') return 'Tập trung chiến lược PULLBACK';
    return `Ưu tiên giao dịch ${c}`;
  }
  if (action === 'REDUCE') return `Hạn chế giao dịch ${c}`;
  return `Cân nhắc ${c}`;
}

function badgeFor(action: string): { label: string; bg: string; fg: string } {
  if (action === 'PRIORITIZE') return { label: 'ƯU TIÊN', bg: M.greenSoft, fg: M.green };
  if (action === 'REDUCE') return { label: 'HẠN CHẾ', bg: M.redSoft, fg: M.red };
  return { label: 'CÂN NHẮC', bg: M.amberSoft, fg: M.amber };
}

function riskNeedleDeg(level: string): number {
  switch (level) {
    case 'Low':
      return -70;
    case 'Medium':
      return -10;
    case 'High':
      return 40;
    case 'Critical':
      return 75;
    default:
      return -90;
  }
}

function riskCaption(level: string): { title: string; sub: string; color: string } {
  switch (level) {
    case 'Low':
      return { title: UL.risk.LOW, sub: 'Rủi ro chấp nhận được', color: M.green };
    case 'Medium':
      return { title: UL.risk.MEDIUM, sub: 'Theo dõi thêm', color: M.amber };
    case 'High':
      return { title: UL.risk.HIGH, sub: 'Cân nhắc giảm rủi ro', color: M.red };
    case 'Critical':
      return { title: UL.risk.CRITICAL, sub: 'Giảm quy mô ngay', color: M.red };
    default:
      return { title: '—', sub: UL.risk.Unknown, color: M.muted };
  }
}

function downloadTextReport(body: string): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tradescore-hieu-suat-ht-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function LineSpark({ values, color }: { values: number[]; color: string }) {
  const [w, setW] = useState(110);
  const pts = values.slice(-10);
  if (pts.length < 2) {
    return <View style={styles.sparkSlot} />;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = Math.max(0.0001, max - min);
  const h = 40;
  return (
    <View
      style={[styles.sparkSlot, { width: '100%', height: h }]}
      onLayout={(e) => {
        const next = Math.floor(e.nativeEvent.layout.width);
        if (next > 0 && next !== w) setW(next);
      }}
    >
      {pts.slice(1).map((v, i) => {
        const x0 = (i / (pts.length - 1)) * w;
        const x1 = ((i + 1) / (pts.length - 1)) * w;
        const y0 = h - ((pts[i] - min) / range) * (h - 2);
        const y1 = h - ((v - min) / range) * (h - 2);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: x0,
              top: y0,
              width: len,
              height: 2.4,
              backgroundColor: color,
              transform: [{ rotate: `${ang}deg` }],
              transformOrigin: 'left center',
            }}
          />
        );
      })}
    </View>
  );
}

function BarSpark({ values }: { values: number[] }) {
  const pts = values.slice(-8);
  const max = Math.max(1, ...pts.map(Math.abs));
  return (
    <View style={styles.barSpark}>
      {pts.map((v, i) => (
        <View
          key={i}
          style={{
            width: 5,
            height: Math.max(5, (Math.abs(v) / max) * 36),
            borderRadius: 2,
            backgroundColor: v >= 0 ? M.green : M.red,
            opacity: 0.85,
          }}
        />
      ))}
    </View>
  );
}

function RingProgress({ pct, color, size = 48 }: { pct: number; color: string; size?: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 4,
        borderColor: `${color}33`,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 4,
          borderColor: 'transparent',
          borderTopColor: color,
          borderRightColor: clamped > 25 ? color : 'transparent',
          borderBottomColor: clamped > 50 ? color : 'transparent',
          borderLeftColor: clamped > 75 ? color : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }}
      />
      <Text style={{ fontSize: 11, fontWeight: '800', color: M.text }}>{clamped.toFixed(0)}</Text>
    </View>
  );
}

function coinIcon(symbol: string): string {
  const s = symbol.replace(/USDT$/i, '').toUpperCase();
  switch (s) {
    case 'BTC':
      return '₿';
    case 'ETH':
      return 'Ξ';
    case 'SOL':
      return '◎';
    case 'BNB':
      return '◆';
    case 'NEAR':
      return '◈';
    default:
      return '●';
  }
}

function coinAccent(symbol: string): string {
  const s = symbol.replace(/USDT$/i, '').toUpperCase();
  switch (s) {
    case 'BTC':
      return '#F7931A';
    case 'ETH':
      return '#627EEA';
    case 'SOL':
      return '#14F195';
    case 'BNB':
      return '#F3BA2F';
    case 'NEAR':
      return '#00C08B';
    default:
      return M.blue;
  }
}

function GradeRing({ grade, score }: { grade: string; score: number | null }) {
  const pct = score == null ? 0 : Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? M.green : pct >= 50 ? M.amber : M.red;
  return (
    <View style={styles.gradeRingWrap}>
      <View style={[styles.gradeRing, { borderColor: `${color}44` }]}>
        <View
          style={[
            styles.gradeRingArc,
            {
              borderTopColor: color,
              borderRightColor: pct > 25 ? color : 'transparent',
              borderBottomColor: pct > 50 ? color : 'transparent',
              borderLeftColor: pct > 75 ? color : 'transparent',
            },
          ]}
        />
        <Text style={[styles.gradeLetter, { color }]}>{grade}</Text>
      </View>
      <Text style={styles.gradeScore}>{score == null ? '—' : `${score.toFixed(0)} / 100`}</Text>
    </View>
  );
}

function SemiRiskGauge({ level }: { level: string }) {
  const deg = riskNeedleDeg(level);
  const cap = riskCaption(level);
  return (
    <View style={styles.semiRiskWrap}>
      <View style={styles.semiRiskTrack}>
        <View style={[styles.semiSeg, { left: 6, borderColor: M.green }]} />
        <View style={[styles.semiSegMid, { borderColor: M.amber }]} />
        <View style={[styles.semiSeg, { right: 6, borderColor: M.red, transform: [{ scaleX: -1 }] }]} />
        <View style={[styles.semiNeedlePivot, { transform: [{ rotate: `${deg}deg` }] }]}>
          <View style={[styles.semiNeedle, { backgroundColor: cap.color }]} />
        </View>
        <View style={styles.semiHub} />
      </View>
      <Text style={[styles.semiRiskTitle, { color: cap.color }]}>{cap.title}</Text>
      <Text style={styles.semiRiskSub}>{cap.sub}</Text>
    </View>
  );
}

function DailyBars({
  rows,
}: {
  rows: { label: string; pnl: number }[];
}) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <View style={styles.dailyBars}>
      {/* subtle horizontal guides — presentation only */}
      <View pointerEvents="none" style={styles.dailyGrid}>
        <View style={styles.dailyGridLine} />
        <View style={styles.dailyGridLine} />
        <View style={styles.dailyGridLine} />
      </View>
      {rows.map((r) => {
        const h = Math.max(14, (Math.abs(r.pnl) / maxAbs) * 148);
        const pos = r.pnl >= 0;
        return (
          <View key={r.label} style={styles.dailyCol}>
            <View style={styles.dailyBarArea}>
              <View
                style={[
                  styles.dailyBar,
                  {
                    height: h,
                    backgroundColor: pos ? M.green : M.red,
                  },
                ]}
              />
            </View>
            <Text style={styles.dailyLbl}>{r.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function HoverCard({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Pressable
      style={({ hovered, pressed }) => [
        style,
        Platform.OS === 'web'
          ? ({
              transition:
                'box-shadow 160ms ease, transform 160ms ease, border-color 160ms ease',
            } as ViewStyle)
          : null,
        Platform.OS === 'web' && hovered
          ? ({
              borderColor: 'rgba(255,255,255,0.10)',
              transform: [{ translateY: -1 }],
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
            } as ViewStyle)
          : null,
        pressed ? { opacity: 0.97 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function PerformanceHtDashboard({
  entries,
}: {
  entries: readonly AiTradeJournalEntry[];
}) {
  const { width } = useWindowDimensions();
  const narrow = width < 1366;
  const accountHistory = useTradeStore((s) => s.accountHistory);
  const [period, setPeriod] = useState<DashboardFilterPeriod>('all');
  const [pnlMode, setPnlMode] = useState<'usdt' | 'pct'>('usdt');
  const [periodOpen, setPeriodOpen] = useState(false);

  const { stats, perf, dash } = useMemo(
    () => buildPerformanceHtDataBundle(entries, { period }),
    [entries, period],
  );
  const equity = useMemo(() => {
    if (accountHistory.length < 2) return null;
    const data = buildEquityCurveData(accountHistory);
    const eqStats = computeEquityCurveStats(accountHistory);
    if (!eqStats) return null;
    return { data, eqStats };
  }, [accountHistory]);

  const o = stats.overview;
  const profit = stats.profit;
  const dd = stats.drawdown;
  const summary = dash.tradingSummary;
  const risk = dash.riskMonitor;
  const updateText = relativeUpdate(summary.generatedAt);
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? 'Toàn thời gian';

  const spark = useMemo(() => stats.byDay.slice(-10).map((d) => d.pnlUsdt ?? 0), [stats.byDay]);
  const equityW = Math.min(860, Math.max(420, width * 0.62 - 40));

  const dailyRows = useMemo(
    () =>
      stats.byDay.slice(-10).map((r) => ({
        label: r.key.length >= 10 ? r.key.slice(8) : r.key.slice(-2),
        pnl: r.pnlUsdt ?? 0,
      })),
    [stats.byDay],
  );

  const insights = useMemo(() => {
    const cards: {
      title: string;
      sub: string;
      value: string;
      icon: string;
      tint: string;
    }[] = [];
    const top = dash.topPicks.topCoin;
    if (top) {
      const row = perf.coinRanking.find((c) => c.key === top);
      cards.push({
        title: `${coinShort(top)} vượt trội`,
        sub: UL.insight.bestPerformer,
        value: row ? `${fmtPnl(row.pnlUsdt)} USDT` : '—',
        icon: '★',
        tint: M.green,
      });
    }
    if (o.winRate != null) {
      cards.push({
        title: 'Win rate cao',
        sub: 'Tỷ lệ thắng',
        value: `${fmt(o.winRate, 1)}%`,
        icon: '🏆',
        tint: M.amber,
      });
    }
    if (dd.longestWinningStreak >= 3) {
      cards.push({
        title: 'Chuỗi thắng',
        sub: UL.insight.winningStreak,
        value: `${dd.longestWinningStreak} ${UL.phrases.trades}`,
        icon: '↗',
        tint: M.green,
      });
    }
    cards.push({
      title: 'Drawdown kiểm soát',
      sub: UL.insight.maxDrawdown,
      value: `${fmt(dd.maxDrawdownUsdt, 2)} USDT`,
      icon: '⚠',
      tint: M.amber,
    });
    if (profit.profitFactor != null) {
      cards.push({
        title: 'PF tích cực',
        sub: UL.insight.profitFactor,
        value: fmt(profit.profitFactor, 2),
        icon: '◈',
        tint: M.blue,
      });
    }
    return cards.slice(0, 5);
  }, [dash.topPicks.topCoin, perf.coinRanking, o.winRate, dd, profit.profitFactor]);

  const recs = dash.recommendationPanel.items.slice(0, 3);

  const eqPnl =
    equity == null ? null : equity.eqStats.currentValue - equity.eqStats.startValue;
  const eqPct =
    equity == null || equity.eqStats.startValue === 0
      ? null
      : ((equity.eqStats.currentValue - equity.eqStats.startValue) /
          equity.eqStats.startValue) *
        100;

  const onExport = () => {
    downloadTextReport(
      [
        'TradeScore — Hiệu suất hệ thống',
        updateText,
        `Hạng ${summary.overallGrade} · ${fmt(summary.overallScore, 0)}/100`,
        `PnL ${fmtPnl(o.netPnlUsdt)} USDT · WR ${fmt(o.winRate, 1)}% · PF ${fmt(profit.profitFactor, 2)}`,
        ...recs.map((r) => `- ${recHeadline(r.action, r.target)}`),
      ].join('\n'),
    );
  };

  const stabilityScore =
    risk.stability != null
      ? risk.stability
      : perf.overall.systemStability != null
        ? perf.overall.systemStability
        : null;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, narrow && styles.headerStack]}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.h1}>Hiệu suất hệ thống</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <Text style={styles.hSub}>Tổng quan hiệu suất giao dịch của hệ thống.</Text>
        </View>
        <View style={styles.headerRight}>
          <View>
            <Pressable
              onPress={() => setPeriodOpen((v) => !v)}
              style={[styles.dropdown, webPointer]}
            >
              <Text style={styles.dropdownText}>📅 {periodLabel}</Text>
              <Text style={styles.dropdownCaret}>▾</Text>
            </Pressable>
            {periodOpen ? (
              <View style={styles.dropdownMenu}>
                {PERIODS.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setPeriod(p.id);
                      setPeriodOpen(false);
                    }}
                    style={webPointer}
                  >
                    <Text
                      style={[
                        styles.dropdownItem,
                        period === p.id && { color: M.green },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.updateRow}>
            <View style={styles.pulse} />
            <Text style={styles.updateText}>{updateText}</Text>
          </View>
          <Pressable onPress={onExport} style={[styles.exportBtn, webPointer]}>
            <Text style={styles.exportText}>⬇ {UL.buttons.export}</Text>
          </Pressable>
        </View>
      </View>

      {/* KPI row — 7 compact cards */}
      <View style={styles.kpiRow}>
        <HoverCard style={[styles.kpiCard, styles.kpiCompact]}>
          <Text style={styles.kpiLabel}>Hạng tổng</Text>
          <GradeRing grade={summary.overallGrade} score={summary.overallScore} />
        </HoverCard>

        <HoverCard style={[styles.kpiCard, styles.kpiCompact]}>
          <Text style={styles.kpiLabel}>Sức khỏe hệ thống</Text>
          <View style={styles.healthRow}>
            <View style={styles.shield}>
              <Text style={{ fontSize: 22 }}>🛡</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      summary.systemHealth === 'Critical' || summary.systemHealth === 'Warning'
                        ? M.red
                        : M.green,
                    fontSize: 22,
                  },
                ]}
              >
                {healthShort(summary.systemHealth)}
              </Text>
              <Text style={styles.kpiHint}>{healthDesc(summary.systemHealth)}</Text>
            </View>
          </View>
        </HoverCard>

        <HoverCard style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{UL.kpi.netPnl}</Text>
          <Text
            style={[
              styles.kpiValue,
              { color: (o.netPnlUsdt ?? 0) >= 0 ? M.green : M.red },
            ]}
          >
            {fmtPnl(o.netPnlUsdt)} USDT
          </Text>
          <Text style={styles.kpiDelta}>
            {eqPct != null ? `${fmtPnl(eqPct)}%` : '—'}
          </Text>
          <LineSpark values={spark} color={(o.netPnlUsdt ?? 0) >= 0 ? M.green : M.red} />
        </HoverCard>

        <HoverCard style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{UL.kpi.winRate}</Text>
          <View style={styles.wrKpi}>
            <Text style={styles.kpiValue}>{fmt(o.winRate, 1)}%</Text>
            <RingProgress pct={o.winRate ?? 0} color={M.green} size={60} />
          </View>
          <Text style={styles.kpiDelta}>
            {o.wins}/{o.totalTrades} thắng
          </Text>
        </HoverCard>

        <HoverCard style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{UL.kpi.profitFactor}</Text>
          <Text style={styles.kpiValue}>{fmt(profit.profitFactor, 2)}</Text>
          <Text style={styles.kpiDelta}>PF</Text>
          <LineSpark values={spark.map((v) => Math.abs(v))} color={M.blue} />
        </HoverCard>

        <HoverCard style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{UL.kpi.expectancy}</Text>
          <Text
            style={[
              styles.kpiValue,
              { color: (profit.expectancyUsdt ?? 0) >= 0 ? M.green : M.red },
            ]}
          >
            {fmtPnl(profit.expectancyUsdt)} USDT
          </Text>
          <Text style={styles.kpiDelta}>kỳ vọng / lệnh</Text>
          <LineSpark values={spark} color={M.purple} />
        </HoverCard>

        <HoverCard style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Tổng giao dịch</Text>
          <Text style={styles.kpiValue}>{o.totalTrades}</Text>
          <Text style={styles.kpiDelta}>
            {o.wins}W · {o.losses}L
          </Text>
          <BarSpark values={spark.length ? spark : [1, 2, 1, 3, 2]} />
        </HoverCard>
      </View>

      {/* Equity + Coin — Task 14.6.7A visual polish */}
      <View style={[styles.midRow, narrow && styles.stack]}>
        <HoverCard style={[styles.card, styles.equityCard]}>
          <View style={styles.cardHead}>
            <View style={styles.equityTitleBlock}>
              <Text style={styles.equityTitle}>{UL.chart.equityCurve}</Text>
              <Text style={styles.equitySubtitle}>Tích lũy theo lệnh đã đóng</Text>
            </View>
            <View style={styles.eqTabs}>
              <Pressable
                onPress={() => setPnlMode('usdt')}
                style={[styles.eqTab, pnlMode === 'usdt' && styles.eqTabOn, webPointer]}
              >
                <Text style={[styles.eqTabText, pnlMode === 'usdt' && styles.eqTabTextOn]}>
                  PnL (USDT)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPnlMode('pct')}
                style={[styles.eqTab, pnlMode === 'pct' && styles.eqTabOn, webPointer]}
              >
                <Text style={[styles.eqTabText, pnlMode === 'pct' && styles.eqTabTextOn]}>
                  PnL (%)
                </Text>
              </Pressable>
            </View>
          </View>
          <Text
            style={[
              styles.eqBig,
              { color: (eqPnl ?? 0) >= 0 ? M.green : M.red },
            ]}
          >
            {pnlMode === 'usdt' ? `${fmtPnl(eqPnl)} USDT` : `${fmtPnl(eqPct)}%`}
          </Text>
          <View style={styles.eqChartWrap}>
            {equity == null ? (
              <Text style={styles.empty}>Cần ≥ 2 lệnh đóng</Text>
            ) : (
              <EquityCurveChart
                data={equity.data}
                stats={equity.eqStats}
                height={588}
                width={equityW}
                showStats={false}
              />
            )}
          </View>
          <View style={styles.eqFooter}>
            {[
              ['Tổng PNL', fmtPnl(o.netPnlUsdt)],
              ['Lợi nhuận tối đa', fmtPnl(profit.largestWinUsdt)],
              ['Lỗ tối đa', fmtPnl(profit.largestLossUsdt)],
              [UL.kpi.drawdownMax, fmt(dd.maxDrawdownUsdt, 2)],
              ['Thắng lớn nhất', fmtPnl(profit.largestWinUsdt)],
              ['Thua lớn nhất', fmtPnl(profit.largestLossUsdt)],
            ].map(([k, v]) => (
              <View key={k} style={styles.eqStat}>
                <Text style={styles.eqStatLbl}>{k}</Text>
                <Text
                  style={[
                    styles.eqStatVal,
                    String(v).startsWith('+')
                      ? { color: M.green }
                      : String(v).startsWith('-')
                        ? { color: M.red }
                        : null,
                  ]}
                >
                  {v}
                </Text>
              </View>
            ))}
          </View>
        </HoverCard>

        <HoverCard style={[styles.card, styles.coinCard]}>
          <Text style={styles.coinCardTitle}>{UL.chart.performanceByCoin}</Text>
          <View style={styles.coinHead}>
            <Text style={[styles.th, { flex: 1.2 }]}>{UL.coin.coin}</Text>
            <Text style={[styles.th, { flex: 1.15, textAlign: 'right' }]}>{UL.coin.pnl}</Text>
            <Text style={[styles.th, { flex: 2.0, textAlign: 'right' }]}>{UL.coin.winRate}</Text>
            <Text style={[styles.th, { width: 44, textAlign: 'right' }]}>{UL.coin.trades}</Text>
          </View>
          {perf.coinRanking.slice(0, 6).map((r, idx) => {
            const wr = r.winRate ?? 0;
            const accent = coinAccent(r.key);
            const isTop =
              (dash.topPicks.topCoin != null && r.key === dash.topPicks.topCoin) ||
              (dash.topPicks.topCoin == null && idx === 0);
            const wrColor = wr >= 50 ? M.green : wr >= 40 ? M.amber : M.red;
            return (
              <Pressable
                key={r.key}
                style={({ hovered }) => [
                  styles.coinRow,
                  isTop && styles.coinRowTop,
                  Platform.OS === 'web' && hovered
                    ? {
                        backgroundColor: isTop
                          ? 'rgba(34,197,94,0.14)'
                          : 'rgba(255,255,255,0.04)',
                      }
                    : null,
                  webPointer,
                ]}
              >
                <View style={styles.coinNameCell}>
                  <View style={[styles.coinIconWrap, { backgroundColor: `${accent}22` }]}>
                    <Text style={[styles.coinIconText, { color: accent }]}>
                      {coinIcon(r.key)}
                    </Text>
                  </View>
                  <View style={styles.coinNameCol}>
                    <Text style={styles.coinName}>{coinShort(r.key)}</Text>
                    {isTop ? (
                      <View style={styles.topBadge}>
                        <Text style={styles.topBadgeText}>TOP</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text
                  style={[
                    styles.coinPnl,
                    { color: (r.pnlUsdt ?? 0) >= 0 ? M.green : M.red },
                  ]}
                >
                  {fmtPnl(r.pnlUsdt)}
                </Text>
                <View style={styles.wrCell}>
                  <Text style={styles.wrNum}>{fmt(r.winRate, 1)}%</Text>
                  <View style={styles.wrTrack}>
                    <View
                      style={[
                        styles.wrFill,
                        {
                          width: `${Math.min(100, Math.max(0, wr))}%`,
                          backgroundColor: wrColor,
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.coinN}>{r.trades}</Text>
              </Pressable>
            );
          })}
          <Text style={styles.linkMore}>{UL.buttons.viewDetails}</Text>
        </HoverCard>
      </View>

      {/* 4-up: Daily | Dist | Risk metrics | Risk gauge — Task 14.6.8 polish */}
      <View style={[styles.bottomGrid, narrow && styles.stack]}>
        <HoverCard style={[styles.card, styles.qCard]}>
          <Text style={styles.bottomCardTitle}>{UL.chart.performanceByDay}</Text>
          {dailyRows.length === 0 ? (
            <Text style={styles.empty}>Chưa có dữ liệu</Text>
          ) : (
            <>
              <View style={styles.dailyLegend}>
                <Text style={styles.dailyLegItem}>
                  <Text style={{ color: M.green }}>●</Text> Lãi
                </Text>
                <Text style={styles.dailyLegItem}>
                  <Text style={{ color: M.red }}>●</Text> Lỗ
                </Text>
              </View>
              <DailyBars rows={dailyRows} />
            </>
          )}
        </HoverCard>

        <HoverCard style={[styles.card, styles.qCard]}>
          <Text style={styles.bottomCardTitle}>Phân bố kết quả</Text>
          <View style={styles.donutBlock}>
            <View
              style={[
                styles.donut,
                { borderColor: o.wins >= o.losses ? M.green : M.red },
              ]}
            >
              <Text style={styles.donutNum}>{o.totalTrades}</Text>
              <Text style={styles.donutHint}>lệnh</Text>
            </View>
            <View style={styles.legend}>
              <Text style={styles.leg}>
                <Text style={{ color: M.green }}>●</Text> Thắng{' '}
                {o.totalTrades ? `${((o.wins / o.totalTrades) * 100).toFixed(1)}%` : '—'}
              </Text>
              <Text style={styles.leg}>
                <Text style={{ color: M.red }}>●</Text> Thua{' '}
                {o.totalTrades ? `${((o.losses / o.totalTrades) * 100).toFixed(1)}%` : '—'}
              </Text>
              <Text style={styles.leg}>
                <Text style={{ color: M.muted }}>●</Text> Hòa{' '}
                {o.totalTrades ? `${((o.breakEven / o.totalTrades) * 100).toFixed(1)}%` : '—'}
              </Text>
            </View>
          </View>
        </HoverCard>

        <HoverCard style={[styles.card, styles.qCard]}>
          <Text style={styles.bottomCardTitle}>{UL.chart.riskMetrics}</Text>
          {[
            [UL.kpi.maxDrawdown, `${fmt(dd.maxDrawdownUsdt, 2)} USDT`],
            [UL.kpi.recoveryFactor, fmt(dd.recoveryFactor, 2)],
            [
              UL.kpi.stabilityScore,
              stabilityScore == null ? '—' : `${fmt(stabilityScore, 1)}/100`,
            ],
            [UL.kpi.consistency, fmt(risk.consistency ?? perf.overall.consistency, 1)],
            [UL.kpi.largestLossStreak, String(dd.longestLosingStreak)],
          ].map(([k, v], i, arr) => (
            <View
              key={k}
              style={[styles.riskListRow, i === arr.length - 1 && styles.riskListRowLast]}
            >
              <Text style={styles.riskListLbl}>{k}</Text>
              <Text style={styles.riskListVal}>{v}</Text>
            </View>
          ))}
        </HoverCard>

        <HoverCard style={[styles.card, styles.qCard]}>
          <Text style={styles.bottomCardTitle}>{UL.chart.riskLevel}</Text>
          <SemiRiskGauge level={risk.riskLevel} />
        </HoverCard>
      </View>

      {/* Insights — compact cards */}
      <HoverCard style={[styles.card, styles.insightSection]}>
        <Text style={styles.bottomCardTitle}>{UL.chart.highlightedInsights}</Text>
        <View style={styles.insightRow}>
          {insights.map((c) => (
            <HoverCard key={c.title} style={styles.insightCard}>
              <View style={[styles.insightIcon, { backgroundColor: `${c.tint}22` }]}>
                <Text style={{ color: c.tint, fontSize: 22 }}>{c.icon}</Text>
              </View>
              <Text style={styles.insightTitle} numberOfLines={1}>
                {c.title}
              </Text>
              <Text style={styles.insightSub} numberOfLines={2}>
                {c.sub}
              </Text>
              <Text style={[styles.insightValue, { color: c.tint }]}>{c.value}</Text>
            </HoverCard>
          ))}
        </View>
      </HoverCard>

      {/* Recommendations — compact rows */}
      <HoverCard style={[styles.card, styles.recSection]}>
        <Text style={styles.bottomCardTitle}>Khuyến nghị hệ thống</Text>
        {recs.length === 0 ? (
          <Text style={styles.empty}>Chưa có khuyến nghị</Text>
        ) : (
          recs.map((r, i) => {
            const b = badgeFor(r.action);
            return (
              <View
                key={r.id}
                style={[styles.recRow, i === recs.length - 1 && styles.recRowLast]}
              >
                <View style={[styles.recIcon, { backgroundColor: `${b.fg}22` }]}>
                  <Text style={{ color: b.fg, fontSize: 13 }}>
                    {r.action === 'PRIORITIZE' ? '↑' : r.action === 'REDUCE' ? '↓' : '·'}
                  </Text>
                </View>
                <View style={styles.recTextCol}>
                  <Text style={styles.recTitle}>{recHeadline(r.action, r.target)}</Text>
                  <Text style={styles.recSub} numberOfLines={2}>
                    {softReason(r.reason)}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: b.bg }]}>
                  <Text style={[styles.badgeText, { color: b.fg }]}>{b.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </HoverCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: S.gap,
    paddingBottom: 24,
    backgroundColor: M.page,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: S.padSm,
    marginBottom: 0,
  },
  headerStack: { flexDirection: 'column' },
  headerLeft: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { fontSize: 20, fontWeight: '800', color: M.text, letterSpacing: -0.3 },
  infoIcon: { fontSize: 13, color: M.muted },
  hSub: { fontSize: 12, color: M.muted, lineHeight: 16 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: M.card,
    borderWidth: 1,
    borderColor: M.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
  dropdownText: { fontSize: 12, fontWeight: '600', color: M.text },
  dropdownCaret: { fontSize: 10, color: M.muted },
  dropdownMenu: {
    position: 'absolute',
    top: 40,
    left: 0,
    zIndex: 20,
    backgroundColor: M.card,
    borderWidth: 1,
    borderColor: M.cardBorder,
    borderRadius: 10,
    padding: 8,
    minWidth: 140,
    gap: 4,
    ...Platform.select({
      web: { boxShadow: `0 8px 24px ${M.shadow}` } as object,
      default: {},
    }),
  },
  dropdownItem: { fontSize: 12, color: M.text, paddingVertical: 6, paddingHorizontal: 8 },
  updateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: M.green,
  },
  updateText: { fontSize: 11, color: M.muted },
  exportBtn: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: M.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 36,
    height: 36,
    justifyContent: 'center',
  },
  exportText: { fontSize: 12, fontWeight: '700', color: M.text },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: S.padSm,
  },
  kpiCard: {
    flexGrow: 1,
    flexBasis: 128,
    minWidth: 120,
    maxWidth: 210,
    backgroundColor: M.card,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: M.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
    minHeight: 156,
    ...Platform.select({
      web: { boxShadow: S.shadow } as object,
      default: {},
    }),
  },
  kpiCompact: { minWidth: 132 },
  kpiLabel: { fontSize: 13, fontWeight: '600', color: M.muted, marginBottom: 6, letterSpacing: 0 },
  kpiValue: { fontSize: 34, fontWeight: '700', color: M.text, letterSpacing: 0, lineHeight: 38 },
  kpiDelta: { fontSize: 11, color: M.muted, fontWeight: '500', opacity: 0.65 },
  kpiHint: { fontSize: 11, color: M.muted, lineHeight: 14, fontWeight: '500', opacity: 0.65 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  shield: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: M.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrKpi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sparkSlot: { marginTop: 6, height: 40, alignSelf: 'stretch' },
  barSpark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 40,
    marginTop: 6,
    alignSelf: 'stretch',
  },
  gradeRingWrap: { alignItems: 'center', gap: 4, marginTop: 2 },
  gradeRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeRingArc: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 5,
    borderColor: 'transparent',
    transform: [{ rotate: '-90deg' }],
  },
  gradeLetter: { fontSize: 20, fontWeight: '800' },
  gradeScore: { fontSize: 10, color: M.muted, fontWeight: '700' },
  midRow: { flexDirection: 'row', gap: S.gap, alignItems: 'stretch' },
  stack: { flexDirection: 'column' },
  card: {
    backgroundColor: M.card,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: M.cardBorder,
    padding: S.pad,
    gap: S.padSm,
    ...Platform.select({
      web: { boxShadow: S.shadow } as object,
      default: {},
    }),
  },
  equityCard: { flex: 2, minWidth: 0, gap: S.padSm, padding: S.pad },
  coinCard: { flex: 1, minWidth: 282, maxWidth: 462, gap: S.padSm, padding: S.pad },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  equityTitleBlock: { gap: 1, flexShrink: 1, paddingRight: 12 },
  equityTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: M.text,
    letterSpacing: -0.2,
  },
  equitySubtitle: {
    fontSize: 10,
    fontWeight: '400',
    color: M.muted,
    letterSpacing: 0.1,
  },
  coinCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: M.text,
    letterSpacing: -0.2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: M.text,
  },
  eqTabs: { flexDirection: 'row', gap: 6 },
  eqTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: M.cardBorder,
  },
  eqTabOn: { backgroundColor: M.greenSoft, borderColor: M.green },
  eqTabText: { fontSize: 11, fontWeight: '700', color: M.muted },
  eqTabTextOn: { color: M.green },
  eqBig: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 0,
    marginBottom: -2,
    lineHeight: 26,
  },
  eqChartWrap: {
    marginTop: 0,
    marginBottom: 0,
    justifyContent: 'flex-start',
  },
  eqFooter: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: M.cardBorder,
    paddingTop: 16,
    paddingBottom: 4,
    marginTop: 4,
    minHeight: 56,
  },
  eqStat: { flex: 1, minWidth: 0, gap: 4 },
  eqStatLbl: {
    fontSize: 12,
    color: M.muted,
    fontWeight: '500',
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0,
    opacity: 0.65,
  },
  eqStatVal: {
    fontSize: 14,
    fontWeight: '700',
    color: M.text,
    lineHeight: 18,
    letterSpacing: 0,
  },
  coinHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    paddingTop: 4,
    paddingLeft: 4,
    borderBottomWidth: 0,
  },
  th: { fontSize: 10, fontWeight: '500', color: M.muted, opacity: 0.65, letterSpacing: 0 },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginHorizontal: -4,
    marginBottom: 3,
    borderRadius: S.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 0,
    gap: 8,
    minHeight: 48,
  },
  coinRowTop: {
    backgroundColor: 'rgba(30,201,90,0.10)',
  },
  coinNameCell: { flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinNameCol: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  coinIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinIconText: { fontSize: 14, fontWeight: '700' },
  coinDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: M.blue,
  },
  coinName: { fontSize: 13, fontWeight: '700', color: M.text, letterSpacing: 0 },
  topBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: M.greenSoft,
    borderWidth: 1,
    borderColor: 'rgba(30,201,90,0.4)',
  },
  topBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: M.green,
    letterSpacing: 0,
  },
  coinPnl: {
    flex: 1.15,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  wrCell: { flex: 2.35, alignItems: 'stretch', gap: 6, minWidth: 150 },
  wrNum: { fontSize: 11, fontWeight: '700', color: M.text, textAlign: 'right', letterSpacing: 0 },
  wrTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: M.track,
    overflow: 'hidden',
  },
  wrFill: { height: '100%', borderRadius: 5 },
  coinN: {
    width: 44,
    textAlign: 'right',
    fontSize: 12,
    color: M.muted,
    fontWeight: '700',
    letterSpacing: 0,
  },
  linkMore: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: M.blue,
    textAlign: 'right',
  },
  bottomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: S.gap,
    alignItems: 'stretch',
  },
  bottomCardTitle: {
    fontSize: S.title,
    fontWeight: '600',
    color: M.text,
    letterSpacing: 0,
    marginBottom: 0,
    lineHeight: 18,
  },
  qCard: {
    flexGrow: 1,
    flexBasis: 210,
    minWidth: 190,
    height: 262,
    minHeight: 262,
    maxHeight: 262,
    gap: S.padSm,
    padding: S.pad,
  },
  dailyLegend: {
    flexDirection: 'row',
    gap: S.padSm,
    alignItems: 'center',
    marginBottom: 0,
  },
  dailyLegItem: { fontSize: 11, color: M.muted, fontWeight: '500', opacity: 0.65 },
  dailyBars: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 156,
    gap: 2,
    paddingTop: 2,
    paddingHorizontal: 0,
    marginTop: 4,
    flex: 1,
  },
  dailyGrid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    bottom: 22,
    justifyContent: 'space-between',
  },
  dailyGridLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(154,163,181,0.14)',
  },
  dailyCol: { flex: 1, alignItems: 'center', gap: 4 },
  dailyBarArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  dailyBar: {
    width: '96%',
    maxWidth: 31,
    borderRadius: 3,
    minHeight: 14,
  },
  dailyLbl: { fontSize: 12, color: M.muted, fontWeight: '500' },
  donutBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  donut: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutNum: { fontSize: 28, fontWeight: '700', color: M.text, letterSpacing: 0 },
  donutHint: { fontSize: 11, color: M.muted, fontWeight: '500', lineHeight: 13, opacity: 0.65 },
  legend: { gap: 12, alignItems: 'flex-start' },
  leg: { fontSize: S.label, color: M.muted, fontWeight: '500', lineHeight: 15 },
  riskListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    minHeight: 43,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  riskListRowLast: { borderBottomWidth: 0 },
  riskListLbl: { fontSize: S.label, color: M.muted, fontWeight: '500', opacity: 0.62 },
  riskListVal: {
    fontSize: S.metric,
    fontWeight: '600',
    color: M.text,
    textAlign: 'right',
    letterSpacing: 0,
  },
  semiRiskWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  semiRiskTrack: {
    width: 182,
    height: 91,
    borderTopLeftRadius: 91,
    borderTopRightRadius: 91,
    borderWidth: 18,
    borderBottomWidth: 0,
    borderColor: M.cardBorder,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  semiSeg: {
    position: 'absolute',
    bottom: 0,
    width: 58,
    height: 58,
    borderTopWidth: 17,
    borderLeftWidth: 17,
    borderTopLeftRadius: 58,
    opacity: 0.9,
  },
  semiSegMid: {
    position: 'absolute',
    top: 2,
    width: 62,
    height: 34,
    borderTopWidth: 17,
    opacity: 0.84,
  },
  semiNeedlePivot: {
    position: 'absolute',
    bottom: 0,
    width: 6,
    height: 68,
    alignItems: 'center',
  },
  semiNeedle: { width: 6, height: 64, borderRadius: 3 },
  semiHub: {
    position: 'absolute',
    bottom: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: M.text,
  },
  semiRiskTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: 0,
  },
  semiRiskSub: {
    fontSize: 14,
    color: M.muted,
    fontWeight: '500',
    marginTop: 0,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.65,
  },
  insightSection: { gap: S.padSm, padding: S.pad },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: S.padSm,
    alignItems: 'stretch',
  },
  insightCard: {
    flexGrow: 1,
    flexBasis: 148,
    minWidth: 132,
    maxWidth: 240,
    height: 130,
    minHeight: 130,
    maxHeight: 130,
    backgroundColor: '#181E28',
    borderRadius: S.radiusSm,
    borderWidth: 1,
    borderColor: M.cardBorder,
    padding: S.padSm,
    gap: 5,
    ...Platform.select({
      web: { boxShadow: S.shadow } as object,
      default: {},
    }),
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: M.text,
    letterSpacing: 0,
    lineHeight: 16,
  },
  insightSub: {
    fontSize: 11,
    color: M.muted,
    lineHeight: 14,
    fontWeight: '500',
    opacity: 0.65,
  },
  insightValue: { fontSize: 15, fontWeight: '700', marginTop: 4, letterSpacing: 0 },
  recSection: { gap: 4, padding: S.pad },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 17,
    minHeight: 66,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  recRowLast: { borderBottomWidth: 0 },
  recIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recTextCol: { flex: 1, gap: 2, minWidth: 0 },
  recTitle: { fontSize: S.metric, fontWeight: '600', color: M.text, lineHeight: 16, letterSpacing: 0 },
  recSub: { fontSize: 11, color: M.muted, lineHeight: 14, fontWeight: '500', opacity: 0.65 },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'center',
    minWidth: 78,
    minHeight: 26,
    justifyContent: 'center',
  },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0 },
  empty: { fontSize: S.label, color: M.muted, paddingVertical: 6, fontWeight: '500' },
});

