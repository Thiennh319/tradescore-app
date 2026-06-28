import type { CapitalStatePersisted } from '../constants/capitalManagement';
import { storageGetItem, storageSetItem } from './storage';

export const CAPITAL_STATE_STORAGE_KEY = 'capital_state';

export async function loadCapitalState(): Promise<CapitalStatePersisted | null> {
  const raw = await storageGetItem(CAPITAL_STATE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CapitalStatePersisted>;
    if (
      typeof parsed.currentCapital !== 'number' ||
      typeof parsed.initialCapital !== 'number' ||
      typeof parsed.lastMilestoneCapital !== 'number'
    ) {
      return null;
    }
    return {
      currentCapital: parsed.currentCapital,
      initialCapital: parsed.initialCapital,
      lastMilestoneCapital: parsed.lastMilestoneCapital,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      milestoneJournal: Array.isArray(parsed.milestoneJournal)
        ? parsed.milestoneJournal.filter((x): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export async function saveCapitalState(state: CapitalStatePersisted): Promise<void> {
  await storageSetItem(CAPITAL_STATE_STORAGE_KEY, JSON.stringify(state));
}
