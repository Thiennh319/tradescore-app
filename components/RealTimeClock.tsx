import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, DEFAULT_SETTINGS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';

interface VnClock {
  time: string;
  date: string;
  hour: number;
  minute: number;
  second: number;
}

function vnNow(): VnClock {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const vn = new Date(utcMs + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${pad(vn.getHours())}:${pad(vn.getMinutes())}:${pad(vn.getSeconds())}`,
    date: `${pad(vn.getDate())}/${pad(vn.getMonth() + 1)}/${vn.getFullYear()}`,
    hour: vn.getHours(),
    minute: vn.getMinutes(),
    second: vn.getSeconds(),
  };
}

const { autoCheckStartHour, autoCheckEndHour, triggerMinute } = DEFAULT_SETTINGS;

/** Đồng hồ + trạng thái phiên & đếm ngược lần quét tự động kế tiếp (Phase 6). */
export function RealTimeClock() {
  const [now, setNow] = useState(vnNow);

  useEffect(() => {
    const id = setInterval(() => setNow(vnNow()), 1_000);
    return () => clearInterval(id);
  }, []);

  const inSession = now.hour >= autoCheckStartHour && now.hour < autoCheckEndHour;

  // Giây còn lại tới phút :triggerMinute kế tiếp
  const secondsNow = now.minute * 60 + now.second;
  const targetSeconds = triggerMinute * 60;
  const deltaSeconds = secondsNow <= targetSeconds ? targetSeconds - secondsNow : 3600 - secondsNow + targetSeconds;
  const mm = Math.floor(deltaSeconds / 60);
  const ss = deltaSeconds % 60;
  const countdown = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const statusColor = inSession ? COLORS.bullish : COLORS.textMuted;

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <View>
          <Text style={styles.time}>{now.time}</Text>
          <Text style={styles.date}>
            {vi.clock.vnLabel} · {now.date}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.right}>
        <Text style={[styles.session, { color: statusColor }]}>
          {inSession ? vi.clock.inSession : vi.clock.offSession}
        </Text>
        <Text style={styles.countdown}>
          {vi.clock.nextScan}{' '}
          <Text style={styles.countdownVal}>{inSession ? countdown : '—'}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: COLORS.border,
  },
  right: {
    gap: 2,
  },
  time: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  date: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  session: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  countdown: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  countdownVal: {
    fontWeight: '800',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
