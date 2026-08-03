/**
 * Task 12B.4 — Journal Event Publisher.
 * Điểm vào Dual Write: nhận Trade Event đã tạo sẵn (Contract 12B.1).
 * Không tạo Event Store mới · không gọi Engine.
 */

import type { TradeEvent } from '../events';
import type { DualWriteCoordinator } from './dualWriteCoordinator';
import type { DualWriteResult, PublishTradeEventInput } from './dualWriteTypes';

/**
 * Publish lifecycle events qua Dual Write Coordinator.
 */
export class JournalEventPublisher {
  constructor(private readonly coordinator: DualWriteCoordinator) {}

  /**
   * Publish một event (append SoT → project → journal view).
   */
  async publish(input: PublishTradeEventInput): Promise<DualWriteResult> {
    return this.coordinator.writeEvent(input.event);
  }

  /**
   * Publish tuần tự nhiều events cùng aggregate (tests / batch).
   */
  async publishAll(events: readonly TradeEvent[]): Promise<DualWriteResult[]> {
    const results: DualWriteResult[] = [];
    for (const event of events) {
      results.push(await this.coordinator.writeEvent(event));
    }
    return results;
  }
}

export function createJournalEventPublisher(
  coordinator: DualWriteCoordinator,
): JournalEventPublisher {
  return new JournalEventPublisher(coordinator);
}
