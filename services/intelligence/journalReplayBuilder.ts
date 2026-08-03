/**
 * Task 14.1 — Replay controller (Rule #58 + #63).
 * Play / Pause / Step / Jump — chỉ đọc Event Timeline.
 * Replay logic unchanged — chỉ bổ sung replayVersion metadata.
 */

import type { IntelligenceTimelineEvent, JournalReplayState } from './types';

/** Rule #63 — bump when replay semantics change in a future task */
export const REPLAY_VERSION = 1 as const;

export function createReplayState(
  tradeId: string,
  events: readonly IntelligenceTimelineEvent[],
): JournalReplayState {
  const list = [...events];
  return {
    tradeId,
    index: 0,
    playing: false,
    events: list,
    current: list[0] ?? null,
    replayVersion: REPLAY_VERSION,
  };
}

export function replayPlay(state: JournalReplayState): JournalReplayState {
  return { ...state, playing: true };
}

export function replayPause(state: JournalReplayState): JournalReplayState {
  return { ...state, playing: false };
}

export function replayStep(state: JournalReplayState): JournalReplayState {
  if (state.events.length === 0) return { ...state, playing: false, current: null };
  const next = Math.min(state.index + 1, state.events.length - 1);
  return {
    ...state,
    index: next,
    playing: false,
    current: state.events[next] ?? null,
  };
}

export function replayJump(
  state: JournalReplayState,
  sequenceOrIndex: number,
): JournalReplayState {
  if (state.events.length === 0) return { ...state, index: 0, current: null, playing: false };
  const bySeq = state.events.findIndex((e) => e.sequence === sequenceOrIndex);
  const index =
    bySeq >= 0
      ? bySeq
      : Math.max(0, Math.min(sequenceOrIndex, state.events.length - 1));
  return {
    ...state,
    index,
    playing: false,
    current: state.events[index] ?? null,
  };
}

/** Advance one step while playing; returns same if at end. */
export function replayTick(state: JournalReplayState): JournalReplayState {
  if (!state.playing || state.events.length === 0) return state;
  if (state.index >= state.events.length - 1) {
    return { ...state, playing: false };
  }
  const next = state.index + 1;
  return {
    ...state,
    index: next,
    current: state.events[next] ?? null,
  };
}
