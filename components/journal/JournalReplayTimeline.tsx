/**
 * Task 14.1 — Replay UI (Play / Pause / Step / Jump).
 * Rule #58 — không gọi Engine / API.
 */
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import {
  createReplayState,
  replayJump,
  replayPause,
  replayPlay,
  replayStep,
  replayTick,
  type IntelligenceTimelineEvent,
} from '../../services/intelligence';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export function JournalReplayTimeline({
  tradeId,
  events,
}: {
  tradeId: string;
  events: readonly IntelligenceTimelineEvent[];
}) {
  const initial = useMemo(
    () => createReplayState(tradeId, events),
    [tradeId, events],
  );
  const [state, setState] = useState(initial);

  useEffect(() => {
    setState(createReplayState(tradeId, events));
  }, [tradeId, events]);

  useEffect(() => {
    if (!state.playing) return;
    const id = setInterval(() => {
      setState((s) => replayTick(s));
    }, 700);
    return () => clearInterval(id);
  }, [state.playing]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sub}>Replay (sequence)</Text>
      <View style={styles.controls}>
        <Pressable
          style={[styles.btn, webPointer]}
          onPress={() => setState((s) => replayPlay(s))}
        >
          <Text style={styles.btnText}>Play</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, webPointer]}
          onPress={() => setState((s) => replayPause(s))}
        >
          <Text style={styles.btnText}>Pause</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, webPointer]}
          onPress={() => setState((s) => replayStep(s))}
        >
          <Text style={styles.btnText}>Step</Text>
        </Pressable>
      </View>
      <Text style={styles.current}>
        #{state.current?.sequence ?? '—'} {state.current?.kind ?? ''} ·{' '}
        {state.current?.label ?? '—'}
      </Text>
      {state.events.map((e) => (
        <Pressable
          key={`${e.sequence}-${e.kind}`}
          style={[
            styles.eventRow,
            state.index === e.sequence - 1 || state.current?.sequence === e.sequence
              ? styles.eventActive
              : null,
            webPointer,
          ]}
          onPress={() => setState((s) => replayJump(s, e.sequence))}
        >
          <Text style={styles.eventText}>
            #{e.sequence} {e.kind}: {e.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: SPACING.sm },
  sub: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 12 },
  controls: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  btn: {
    backgroundColor: COLORS.surfaceElevated ?? COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  current: { color: COLORS.primary, fontSize: 12, marginBottom: 4 },
  eventRow: { paddingVertical: 2 },
  eventActive: { opacity: 1 },
  eventText: { color: COLORS.textSecondary, fontSize: 11 },
});
