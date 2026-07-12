/**
 * Trigger Snapshot Factory — tests (UL-01.1).
 */

import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EMPTY_TRIGGER_SNAPSHOT,
  createEmptyTriggerSnapshot,
  TriggerSnapshotFactory,
} from './triggerSnapshotFactory';

describe('TriggerSnapshotFactory — UL-01.1', () => {
  it('CANONICAL_EMPTY_TRIGGER_SNAPSHOT is frozen empty object', () => {
    expect(CANONICAL_EMPTY_TRIGGER_SNAPSHOT).toEqual({});
    expect(Object.isFrozen(CANONICAL_EMPTY_TRIGGER_SNAPSHOT)).toBe(true);
  });

  it('createEmptyTriggerSnapshot returns canonical shape', () => {
    const snapshot = createEmptyTriggerSnapshot();
    expect(snapshot).toEqual({});
    expect(snapshot.hardBlockResult).toBeUndefined();
    expect(snapshot.recoveryResult).toBeUndefined();
    expect(snapshot.unlockResult).toBeUndefined();
    expect(snapshot.confirmationResult).toBeUndefined();
    expect(snapshot.noiseResult).toBeUndefined();
  });

  it('createEmptyTriggerSnapshot returns fresh copy', () => {
    const first = createEmptyTriggerSnapshot();
    const second = createEmptyTriggerSnapshot();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it('deterministic — identical on repeat calls', () => {
    expect(createEmptyTriggerSnapshot()).toEqual(createEmptyTriggerSnapshot());
  });

  it('namespace exposes factory API', () => {
    expect(TriggerSnapshotFactory.createEmptyTriggerSnapshot).toBe(createEmptyTriggerSnapshot);
    expect(TriggerSnapshotFactory.CANONICAL_EMPTY_TRIGGER_SNAPSHOT).toBe(
      CANONICAL_EMPTY_TRIGGER_SNAPSHOT,
    );
  });
});
