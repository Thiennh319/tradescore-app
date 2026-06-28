import { describe, expect, it } from 'vitest';
import {
  maxDiskJournalCount,
  maxMemoryJournalCount,
  shouldPersistHydratedState,
} from './hydrateSafety';

describe('hydrateSafety', () => {
  it('shouldPersistHydratedState blocks empty memory over disk data', () => {
    expect(shouldPersistHydratedState(0, 5)).toBe(false);
    expect(shouldPersistHydratedState(3, 5)).toBe(true);
    expect(shouldPersistHydratedState(0, 0)).toBe(true);
  });

  it('maxDiskJournalCount picks largest source', () => {
    expect(
      maxDiskJournalCount({ legacy: 1, ai: 0, snapshotLegacy: 0, snapshotAi: 8 }),
    ).toBe(8);
  });

  it('maxMemoryJournalCount', () => {
    expect(maxMemoryJournalCount([{ id: '1' } as never], [])).toBe(1);
    expect(maxMemoryJournalCount([], [{ id: 'a' } as never])).toBe(1);
  });
});
