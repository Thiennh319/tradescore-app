import { describe, expect, it } from 'vitest';
import {
  getScanMarkGeneration,
  notifyScanMarkPricesUpdated,
  subscribeScanMarkPricesUpdated,
} from './scanMarkPriceBus';

describe('scanMarkPriceBus', () => {
  it('notifyScanMarkPricesUpdated increments generation and calls listeners', () => {
    const before = getScanMarkGeneration();
    let called = 0;
    const unsub = subscribeScanMarkPricesUpdated(() => {
      called += 1;
    });
    notifyScanMarkPricesUpdated();
    unsub();
    expect(getScanMarkGeneration()).toBe(before + 1);
    expect(called).toBe(1);
  });
});
