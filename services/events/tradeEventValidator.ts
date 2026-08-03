/**
 * Task 12B.1 — Trade Event Validator.
 * Kiểm tra contract: id, type, payload, UTC, version.
 */

import {
  isTradeEventSource,
  isTradeEventType,
  type TradeEventType,
} from './tradeEventEnums';
import { TradeEventFactory, type TradeEventFactoryError } from './tradeEventFactory';
import type { TradeEvent } from './tradeEventTypes';
import {
  isKnownSchemaVersion,
  isValidEventVersion,
  isValidProducerVersion,
  isValidSchemaVersion,
  TRADE_EVENT_VERSION,
} from './tradeEventVersion';

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export type TradeEventValidationIssueCode =
  | 'DUPLICATE_ID'
  | 'INVALID_TYPE'
  | 'INVALID_SOURCE'
  | 'MISSING_PAYLOAD'
  | 'MISSING_PAYLOAD_FIELD'
  | 'MISSING_UTC'
  | 'INVALID_UTC'
  | 'INVALID_VERSION'
  | 'MISSING_REQUIRED'
  | 'INVALID_SHAPE';

export type TradeEventValidationIssue = {
  code: TradeEventValidationIssueCode;
  message: string;
  eventId?: string;
};

export type TradeEventValidationResult =
  | { ok: true; event: TradeEvent; issues: [] }
  | { ok: false; event?: undefined; issues: TradeEventValidationIssue[] };

function issue(
  code: TradeEventValidationIssueCode,
  message: string,
  eventId?: string,
): TradeEventValidationIssue {
  return { code, message, eventId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate một event (unknown → TradeEvent).
 * Không ghi store.
 */
export function validateTradeEvent(input: unknown): TradeEventValidationResult {
  const issues: TradeEventValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [issue('INVALID_SHAPE', 'Event must be a non-null object')],
    };
  }

  const eventId = input.eventId;
  if (typeof eventId !== 'string' || eventId.trim().length === 0) {
    issues.push(issue('MISSING_REQUIRED', 'Missing eventId'));
  }

  if (!isValidEventVersion(input.eventVersion)) {
    issues.push(
      issue('INVALID_VERSION', `Invalid eventVersion: ${String(input.eventVersion)}`),
    );
  } else if (input.eventVersion !== TRADE_EVENT_VERSION) {
    issues.push(
      issue(
        'INVALID_VERSION',
        `Unsupported eventVersion ${input.eventVersion}; expected ${TRADE_EVENT_VERSION}`,
      ),
    );
  }

  if (!isValidSchemaVersion(input.schemaVersion)) {
    issues.push(
      issue('INVALID_VERSION', `Invalid schemaVersion: ${String(input.schemaVersion)}`),
    );
  } else if (
    typeof input.schemaVersion === 'string' &&
    !isKnownSchemaVersion(input.schemaVersion)
  ) {
    issues.push(
      issue(
        'INVALID_VERSION',
        `Unknown schemaVersion: ${input.schemaVersion}`,
      ),
    );
  }

  if (!isValidProducerVersion(input.producerVersion)) {
    issues.push(issue('INVALID_VERSION', 'Missing or invalid producerVersion'));
  }

  const eventType = input.eventType;
  if (typeof eventType !== 'string' || !isTradeEventType(eventType)) {
    issues.push(issue('INVALID_TYPE', `Invalid eventType: ${String(eventType)}`));
  }

  if (typeof input.source !== 'string' || !isTradeEventSource(input.source)) {
    issues.push(issue('INVALID_SOURCE', `Invalid source: ${String(input.source)}`));
  }

  if (typeof input.aggregateId !== 'string' || input.aggregateId.trim().length === 0) {
    issues.push(issue('MISSING_REQUIRED', 'Missing aggregateId'));
  }

  if (input.aggregateType !== 'TRADE' && input.aggregateType !== 'SYNC') {
    issues.push(issue('INVALID_SHAPE', `Invalid aggregateType: ${String(input.aggregateType)}`));
  }

  if (typeof input.createdAtUtc !== 'string' || input.createdAtUtc.trim().length === 0) {
    issues.push(issue('MISSING_UTC', 'Missing createdAtUtc'));
  } else if (!ISO_UTC_RE.test(input.createdAtUtc)) {
    issues.push(issue('INVALID_UTC', `createdAtUtc must be ISO-8601 UTC: ${input.createdAtUtc}`));
  }

  if (input.payload == null) {
    issues.push(issue('MISSING_PAYLOAD', 'Missing payload'));
  } else if (!isRecord(input.payload)) {
    issues.push(issue('MISSING_PAYLOAD', 'payload must be an object'));
  } else if (typeof eventType === 'string' && isTradeEventType(eventType)) {
    const required = TradeEventFactory.requiredPayloadKeys[eventType as TradeEventType];
    for (const key of required) {
      if (!(key in input.payload) || input.payload[key] === undefined) {
        issues.push(
          issue(
            'MISSING_PAYLOAD_FIELD',
            `${eventType} payload missing required field: ${key}`,
            typeof eventId === 'string' ? eventId : undefined,
          ),
        );
      }
    }
  }

  if (!isRecord(input.metadata)) {
    issues.push(issue('INVALID_SHAPE', 'metadata must be an object'));
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues: issues.map((i) =>
        typeof eventId === 'string' ? { ...i, eventId: i.eventId ?? eventId } : i,
      ),
    };
  }

  // Re-run through factory to enforce same rules / normalize shape.
  try {
    const event = TradeEventFactory.create({
      eventId: input.eventId as string,
      eventType: input.eventType as TradeEventType,
      aggregateId: input.aggregateId as string,
      aggregateType: input.aggregateType as 'TRADE' | 'SYNC',
      source: input.source as TradeEvent['source'],
      createdAtUtc: input.createdAtUtc as string,
      producerVersion: input.producerVersion as string,
      eventVersion: input.eventVersion as typeof TRADE_EVENT_VERSION,
      schemaVersion: input.schemaVersion as string,
      correlationId:
        typeof input.correlationId === 'string' ? input.correlationId : undefined,
      causationId:
        typeof input.causationId === 'string' ? input.causationId : undefined,
      idempotencyKey:
        typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined,
      payload: input.payload as TradeEvent['payload'],
      metadata: input.metadata as TradeEvent['metadata'],
    });
    return { ok: true, event, issues: [] };
  } catch (err) {
    const fe = err as TradeEventFactoryError;
    const code = (fe.code ?? 'INVALID_SHAPE') as TradeEventValidationIssueCode;
    return {
      ok: false,
      issues: [
        issue(
          code,
          fe.message ?? 'Factory rejected event',
          typeof eventId === 'string' ? eventId : undefined,
        ),
      ],
    };
  }
}

/**
 * Validate batch — phát hiện duplicate eventId.
 */
export function validateTradeEventBatch(inputs: unknown[]): {
  ok: boolean;
  results: TradeEventValidationResult[];
  duplicateIds: string[];
} {
  const results = inputs.map(validateTradeEvent);
  const seen = new Map<string, number>();
  const duplicateIds: string[] = [];

  for (const result of results) {
    if (!result.ok) continue;
    const id = result.event.eventId;
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    if (count === 2) duplicateIds.push(id);
  }

  if (duplicateIds.length > 0) {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.ok) continue;
      if (!duplicateIds.includes(r.event.eventId)) continue;
      results[i] = {
        ok: false,
        issues: [
          issue(
            'DUPLICATE_ID',
            `Duplicate eventId in batch: ${r.event.eventId}`,
            r.event.eventId,
          ),
        ],
      };
    }
  }

  return {
    ok: results.every((r) => r.ok) && duplicateIds.length === 0,
    results,
    duplicateIds,
  };
}
