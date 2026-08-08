import { describe, expect, it } from 'vitest';
import { mergeByIdRemoteWins } from '../driveSyncMerge';

describe('mergeByIdRemoteWins (V3V4-SYNC-3d)', () => {
  it('adds remote-only ids → N+M without dupes', () => {
    const local = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
    ];
    const remote = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
      { id: 'c', v: 1 },
    ];
    const { merged, changes } = mergeByIdRemoteWins(local, remote);
    expect(merged).toHaveLength(3);
    expect(merged.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
    expect(changes).toBe(1);
  });

  it('keeps local-only when remote is partial wipe', () => {
    const local = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
      { id: 'c', v: 1 },
    ];
    const remote = [{ id: 'a', v: 1 }];
    const { merged, changes } = mergeByIdRemoteWins(local, remote);
    expect(merged).toHaveLength(3);
    expect(merged.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
    expect(changes).toBe(0);
  });

  it('same id: remote wins on content change', () => {
    const local = [{ id: 'a', v: 1 }];
    const remote = [{ id: 'a', v: 99 }];
    const { merged, changes } = mergeByIdRemoteWins(local, remote);
    expect(merged).toEqual([{ id: 'a', v: 99 }]);
    expect(changes).toBe(1);
  });

  it('empty local + full remote (APK empty-push restore) ≡ replace', () => {
    const remote = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ];
    const { merged, changes } = mergeByIdRemoteWins([], remote);
    expect(merged).toEqual(remote);
    expect(changes).toBe(2);
  });

  it('empty remote does not wipe local', () => {
    const local = [{ id: 'keep', v: 1 }];
    const { merged, changes } = mergeByIdRemoteWins(local, []);
    expect(merged).toEqual(local);
    expect(changes).toBe(0);
  });
});
