/**
 * Pipeline validation utilities — shared helpers (Task 02.6.7).
 *
 * **Purpose:** Single implementation for common validate* patterns across ESM pipeline layers.
 * **Do not use in:** Production modules outside entryStateManager.
 *
 * @module entryStateManager/pipelineValidationUtils
 */

/** Type guard for plain object records used in context/result validation. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Ensures halted results carry zero countable items (actionCount, dispatchCount, etc.). */
export function validateHaltedCountConsistency(
  halted: boolean,
  count: number,
  countFieldName: string,
  errors: string[],
): void {
  if (halted && count > 0) {
    errors.push(`halted result must have ${countFieldName} 0`);
  }
}

/** Ensures executionOrder values are contiguous starting at 1. */
export function validateSequentialOrdersFromOne(
  orders: readonly number[],
  errors: string[],
): void {
  if (orders.length === 0) {
    return;
  }
  const sorted = [...orders].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== index + 1) {
      errors.push('executionOrder must be sequential starting at 1');
      break;
    }
  }
}

/** Ensures a numeric collection has no duplicates — caller supplies error message. */
export function validateUniqueNumericValues(
  values: readonly number[],
  duplicateError: string,
  errors: string[],
): void {
  if (values.length !== new Set(values).size) {
    errors.push(duplicateError);
  }
}

/** Ensures a string collection has no duplicates — caller supplies error message. */
export function validateUniqueValues(
  values: readonly string[],
  duplicateError: string,
  errors: string[],
): void {
  if (values.length !== new Set(values).size) {
    errors.push(duplicateError);
  }
}

/** Ensures a field is a non-empty trimmed string — caller supplies field label for error text. */
export function validateRequiredNonEmptyString(
  value: unknown,
  fieldName: string,
  errors: string[],
): void {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${fieldName} must be a non-empty string`);
  }
}

/** Ensures a field is boolean — caller supplies field label for error text. */
export function validateRequiredBoolean(
  value: unknown,
  fieldName: string,
  errors: string[],
): void {
  if (typeof value !== 'boolean') {
    errors.push(`${fieldName} must be boolean`);
  }
}

/** Pushes a custom mismatch error when values differ. */
export function validateFieldMatch(
  actual: unknown,
  expected: unknown,
  errorMessage: string,
  errors: string[],
): void {
  if (actual !== expected) {
    errors.push(errorMessage);
  }
}
