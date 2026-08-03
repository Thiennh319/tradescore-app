/**
 * Task 12B.3 — Projection versioning (độc lập Event Version).
 */

/** Phiên bản logic Projector / reducer. */
export const TRADE_PROJECTION_VERSION = 1 as const;

export type TradeProjectionVersion = typeof TRADE_PROJECTION_VERSION;

/** Schema của Projection State / materialize mapping. */
export const TRADE_PROJECTION_SCHEMA_VERSION = '1.0.0' as const;

export type TradeProjectionSchemaVersion = typeof TRADE_PROJECTION_SCHEMA_VERSION;
