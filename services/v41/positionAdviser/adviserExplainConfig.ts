/**
 * V4.1 Task 5 — Position Adviser Explain Layer configuration.
 * Toàn bộ nhãn / mẫu tiếng Việt — thuật toán không hard-code câu chữ.
 */

import type { V41DecisionFoundationState } from '../foundation/states';

export const V41_ADVISER_EXPLAIN_CONFIG = {
  sectionLabels: {
    reasons: 'Lý do',
    warnings: 'Điểm cần lưu ý',
    nextAction: 'Khuyến nghị',
    assessment: 'Đánh giá',
    confidence: 'Độ tin cậy',
    strength: 'Sức mạnh tín hiệu',
  },

  decisionHeadline: {
    LONG: 'LONG',
    SHORT: 'SHORT',
    WATCH: 'WATCH',
    IGNORE: 'IGNORE',
  } satisfies Record<V41DecisionFoundationState, string>,

  summaryIntro: {
    LONG: 'Đây là tín hiệu đảo chiều đã được xác nhận, hướng LONG.',
    SHORT: 'Đây là tín hiệu đảo chiều đã được xác nhận, hướng SHORT.',
    WATCH: 'Có tín hiệu đảo chiều nhưng chưa đủ mạnh để giao dịch.',
    IGNORE: 'Chưa đủ điều kiện để đánh giá hoặc giao dịch.',
  } satisfies Record<V41DecisionFoundationState, string>,

  nextAction: {
    LONG: 'Khuyến nghị mở vị thế LONG.',
    SHORT: 'Khuyến nghị mở vị thế SHORT.',
    WATCH: 'Tiếp tục WATCH — theo dõi thêm trước khi vào lệnh.',
    IGNORE: 'Không giao dịch.',
  } satisfies Record<V41DecisionFoundationState, string>,

  assessment: {
    LONG: 'Đánh giá: tín hiệu đủ điều kiện kích hoạt LONG.',
    SHORT: 'Đánh giá: tín hiệu đủ điều kiện kích hoạt SHORT.',
    WATCH: 'Đánh giá: giữ trạng thái quan sát, chưa kích hoạt lệnh.',
    IGNORE: 'Đánh giá: bỏ qua tín hiệu trong phiên này.',
  } satisfies Record<V41DecisionFoundationState, string>,

  reasonPrefixes: {
    supporting: '✓',
    warning: '⚠',
    neutral: '○',
  },
} as const;

export type V41AdviserExplainConfig = typeof V41_ADVISER_EXPLAIN_CONFIG;
