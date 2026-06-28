import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import type { NotificationPermissionStatus } from '../services/sessionNotification';

interface SessionNotificationToggleProps {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermissionStatus;
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => Promise<boolean>;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

/** Nút bật/tắt + test thông báo phiên quét :02 (web + Android/iOS). */
export function SessionNotificationToggle({
  supported,
  enabled,
  permission,
  onEnable,
  onDisable,
  onTest,
}: SessionNotificationToggleProps) {
  const [testMsg, setTestMsg] = useState<string | null>(null);

  if (!supported) return null;

  const denied = permission === 'denied';
  const active = enabled && permission === 'granted';

  const handleTest = () => {
    setTestMsg(null);
    void onTest().then((ok) => {
      setTestMsg(ok ? vi.clock.notifyTestOk : vi.clock.notifyTestFail);
      setTimeout(() => setTestMsg(null), 4000);
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={active ? onDisable : onEnable}
          disabled={denied}
          style={({ pressed }) => [
            styles.btn,
            active && styles.btnOn,
            denied && styles.btnDenied,
            pressed && !denied && styles.btnPressed,
            webPointer,
          ]}
        >
          <Text style={[styles.btnText, active && styles.btnTextOn]}>
            {active ? `🔔 ${vi.clock.notifyOn}` : `🔕 ${vi.clock.notifyOff}`}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleTest}
          disabled={denied}
          style={({ pressed }) => [
            styles.btn,
            styles.testBtn,
            denied && styles.btnDenied,
            pressed && !denied && styles.btnPressed,
            webPointer,
          ]}
        >
          <Text style={styles.testText}>{vi.clock.notifyTest}</Text>
        </Pressable>
      </View>
      {testMsg ? <Text style={[styles.hint, testMsg.includes('Không') && styles.hintErr]}>{testMsg}</Text> : null}
      {denied ? (
        <Text style={styles.hint}>{vi.clock.notifyDenied}</Text>
      ) : !active && !testMsg ? (
        <Text style={styles.hint}>{vi.clock.notifyHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
    minWidth: 120,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  btn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  testBtn: {
    borderColor: COLORS.accent,
  },
  btnOn: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.12)',
  },
  btnDenied: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  btnTextOn: {
    color: COLORS.accent,
  },
  testText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent,
  },
  hint: {
    fontSize: 9,
    color: COLORS.bullish,
    lineHeight: 12,
  },
  hintErr: {
    color: COLORS.bearish,
  },
});
