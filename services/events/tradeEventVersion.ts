/**
 * Task 12B.1 — Event / schema / producer versions (độc lập nhau).
 */

/** Phiên bản envelope Event (field shape của base event). */
export const TRADE_EVENT_VERSION = 1 as const;

export type TradeEventVersion = typeof TRADE_EVENT_VERSION;

/** Phiên bản contract payload + enums (schema). */
export const TRADE_EVENT_SCHEMA_VERSION = '1.0.0' as const;

export type TradeEventSchemaVersion = typeof TRADE_EVENT_SCHEMA_VERSION;

/**
 * Phiên bản producer mặc định khi factory không truyền.
 * Độc lập với eventVersion / schemaVersion.
 */
export const TRADE_EVENT_PRODUCER_VERSION = 'tradescore-event-contract-1.0.0' as const;

export type TradeEventProducerVersion = string;

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function isValidEventVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

export function isValidSchemaVersion(value: unknown): value is string {
  return typeof value === 'string' && SEMVER_RE.test(value);
}

export function isValidProducerVersion(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isKnownSchemaVersion(value: string): boolean {
  return value === TRADE_EVENT_SCHEMA_VERSION;
}
