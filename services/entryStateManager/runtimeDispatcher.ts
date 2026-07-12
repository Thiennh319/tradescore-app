/**
 * Runtime Dispatcher — scaffold (Task 02.6.5).
 *
 * **Builds** {@link RuntimeDispatchItem} plan from {@link ActionRuntimeResult}.
 * **Does NOT** execute, queue workers, or wire production.
 *
 * @module entryStateManager/runtimeDispatcher
 */

import { validateActionRuntimeContext } from './actionRuntime';
import { RuntimeActionStatus, type ActionRuntimeResult, type RuntimeAction } from './actionRuntimeTypes';
import {
  RuntimeDispatchStatus,
  type RuntimeDispatchItem,
  type RuntimeDispatcherContext,
  type RuntimeDispatcherContextValidationResult,
  type RuntimeDispatcherResult,
  type RuntimeDispatcherResultValidationResult,
} from './runtimeDispatcherTypes';
import { EntryState } from './stateMachineTypes';
import {
  isRecord,
  validateHaltedCountConsistency,
  validateSequentialOrdersFromOne,
  validateUniqueNumericValues,
  validateUniqueValues,
} from './pipelineValidationUtils';

const RUNTIME_DISPATCH_STATUS_VALUES = new Set<string>(Object.values(RuntimeDispatchStatus));

export function isRuntimeDispatchStatus(value: unknown): value is RuntimeDispatchStatus {
  return typeof value === 'string' && RUNTIME_DISPATCH_STATUS_VALUES.has(value);
}

export function buildDispatchId(executionOrder: number): string {
  return `DISPATCH-${String(executionOrder).padStart(3, '0')}`;
}

function resolveDispatchStatus(runtimeAction: RuntimeAction): RuntimeDispatchStatus {
  if (runtimeAction.status === RuntimeActionStatus.SKIPPED) {
    return RuntimeDispatchStatus.SKIPPED;
  }
  return RuntimeDispatchStatus.QUEUED;
}

function createMissingActionRuntimeFallback(): ActionRuntimeResult {
  return {
    actionEngineResult: {
      stateMachineResult: {
        currentState: EntryState.IDLE,
        availableTransitions: [],
        nextState: null,
        transitionPerformed: false,
        halted: true,
        message: 'Missing actionRuntimeResult',
        context: {
          finalDecisionResult: {
            decisionResult: {
              conflictResult: {
                priorityResult: {
                  aggregateResult: {
                    triggerCount: 0,
                    halted: true,
                    message: '',
                    context: {},
                  },
                  priorityGroups: [],
                  highestPriority: null,
                  halted: true,
                  message: '',
                  context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                },
                conflictGroups: [],
                conflictCount: 0,
                resolvedConflicts: [],
                resolvedCount: 0,
                unresolvedCount: 0,
                halted: true,
                message: '',
                context: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                },
              },
              decisionCandidates: [],
              candidateCount: 0,
              halted: true,
              message: '',
              context: {
                conflictResult: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                  conflictGroups: [],
                  conflictCount: 0,
                  resolvedConflicts: [],
                  resolvedCount: 0,
                  unresolvedCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                  },
                },
              },
            },
          },
          finalDecision: null,
          decisionCount: 0,
          halted: true,
          message: '',
          context: {
            decisionResult: {
              conflictResult: {
                priorityResult: {
                  aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                  priorityGroups: [],
                  highestPriority: null,
                  halted: true,
                  message: '',
                  context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                },
                conflictGroups: [],
                conflictCount: 0,
                resolvedConflicts: [],
                resolvedCount: 0,
                unresolvedCount: 0,
                halted: true,
                message: '',
                context: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                },
              },
              decisionCandidates: [],
              candidateCount: 0,
              halted: true,
              message: '',
              context: {
                conflictResult: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                  conflictGroups: [],
                  conflictCount: 0,
                  resolvedConflicts: [],
                  resolvedCount: 0,
                  unresolvedCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                  },
                },
              },
            },
          },
        },
        currentState: EntryState.IDLE,
      },
      actions: [],
      actionCount: 0,
      halted: true,
      message: 'Missing actionRuntimeResult',
      context: {
        stateMachineResult: {
          currentState: EntryState.IDLE,
          availableTransitions: [],
          nextState: null,
          transitionPerformed: false,
          halted: true,
          message: '',
          context: {
            finalDecisionResult: {
              decisionResult: {
                conflictResult: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                  conflictGroups: [],
                  conflictCount: 0,
                  resolvedConflicts: [],
                  resolvedCount: 0,
                  unresolvedCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                  },
                },
                decisionCandidates: [],
                candidateCount: 0,
                halted: true,
                message: '',
                context: {
                  conflictResult: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                    conflictGroups: [],
                    conflictCount: 0,
                    resolvedConflicts: [],
                    resolvedCount: 0,
                    unresolvedCount: 0,
                    halted: true,
                    message: '',
                    context: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                    },
                  },
                },
              },
              finalDecision: null,
              decisionCount: 0,
              halted: true,
              message: '',
              context: {
                decisionResult: {
                  conflictResult: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                    conflictGroups: [],
                    conflictCount: 0,
                    resolvedConflicts: [],
                    resolvedCount: 0,
                    unresolvedCount: 0,
                    halted: true,
                    message: '',
                    context: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                    },
                  },
                  decisionCandidates: [],
                  candidateCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    conflictResult: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                      conflictGroups: [],
                      conflictCount: 0,
                      resolvedConflicts: [],
                      resolvedCount: 0,
                      unresolvedCount: 0,
                      halted: true,
                      message: '',
                      context: {
                        priorityResult: {
                          aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                          priorityGroups: [],
                          highestPriority: null,
                          halted: true,
                          message: '',
                          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                        },
                      },
                    },
                  },
                },
              },
            },
            currentState: EntryState.IDLE,
          },
        },
      },
    },
    runtimeActions: [],
    actionCount: 0,
    halted: true,
    message: 'Missing actionRuntimeResult',
    context: {
      actionEngineResult: {
        stateMachineResult: {
          currentState: EntryState.IDLE,
          availableTransitions: [],
          nextState: null,
          transitionPerformed: false,
          halted: true,
          message: '',
          context: {
            finalDecisionResult: {
              decisionResult: {
                conflictResult: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                  conflictGroups: [],
                  conflictCount: 0,
                  resolvedConflicts: [],
                  resolvedCount: 0,
                  unresolvedCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                  },
                },
                decisionCandidates: [],
                candidateCount: 0,
                halted: true,
                message: '',
                context: {
                  conflictResult: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                    conflictGroups: [],
                    conflictCount: 0,
                    resolvedConflicts: [],
                    resolvedCount: 0,
                    unresolvedCount: 0,
                    halted: true,
                    message: '',
                    context: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                    },
                  },
                },
              },
              finalDecision: null,
              decisionCount: 0,
              halted: true,
              message: '',
              context: {
                decisionResult: {
                  conflictResult: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                    conflictGroups: [],
                    conflictCount: 0,
                    resolvedConflicts: [],
                    resolvedCount: 0,
                    unresolvedCount: 0,
                    halted: true,
                    message: '',
                    context: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                    },
                  },
                  decisionCandidates: [],
                  candidateCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    conflictResult: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                      conflictGroups: [],
                      conflictCount: 0,
                      resolvedConflicts: [],
                      resolvedCount: 0,
                      unresolvedCount: 0,
                      halted: true,
                      message: '',
                      context: {
                        priorityResult: {
                          aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                          priorityGroups: [],
                          highestPriority: null,
                          halted: true,
                          message: '',
                          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                        },
                      },
                    },
                  },
                },
              },
            },
            currentState: EntryState.IDLE,
          },
        },
        actions: [],
        actionCount: 0,
        halted: true,
        message: '',
        context: {
          stateMachineResult: {
            currentState: EntryState.IDLE,
            availableTransitions: [],
            nextState: null,
            transitionPerformed: false,
            halted: true,
            message: '',
            context: {
              finalDecisionResult: {
                decisionResult: {
                  conflictResult: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                    conflictGroups: [],
                    conflictCount: 0,
                    resolvedConflicts: [],
                    resolvedCount: 0,
                    unresolvedCount: 0,
                    halted: true,
                    message: '',
                    context: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                    },
                  },
                  decisionCandidates: [],
                  candidateCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    conflictResult: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                      conflictGroups: [],
                      conflictCount: 0,
                      resolvedConflicts: [],
                      resolvedCount: 0,
                      unresolvedCount: 0,
                      halted: true,
                      message: '',
                      context: {
                        priorityResult: {
                          aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                          priorityGroups: [],
                          highestPriority: null,
                          halted: true,
                          message: '',
                          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                        },
                      },
                    },
                  },
                },
                finalDecision: null,
                decisionCount: 0,
                halted: true,
                message: '',
                context: {
                  decisionResult: {
                    conflictResult: {
                      priorityResult: {
                        aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                        priorityGroups: [],
                        highestPriority: null,
                        halted: true,
                        message: '',
                        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                      },
                      conflictGroups: [],
                      conflictCount: 0,
                      resolvedConflicts: [],
                      resolvedCount: 0,
                      unresolvedCount: 0,
                      halted: true,
                      message: '',
                      context: {
                        priorityResult: {
                          aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                          priorityGroups: [],
                          highestPriority: null,
                          halted: true,
                          message: '',
                          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                        },
                      },
                    },
                    decisionCandidates: [],
                    candidateCount: 0,
                    halted: true,
                    message: '',
                    context: {
                      conflictResult: {
                        priorityResult: {
                          aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                          priorityGroups: [],
                          highestPriority: null,
                          halted: true,
                          message: '',
                          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                        },
                        conflictGroups: [],
                        conflictCount: 0,
                        resolvedConflicts: [],
                        resolvedCount: 0,
                        unresolvedCount: 0,
                        halted: true,
                        message: '',
                        context: {
                          priorityResult: {
                            aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                            priorityGroups: [],
                            highestPriority: null,
                            halted: true,
                            message: '',
                            context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                          },
                        },
                      },
                    },
                  },
                },
              },
              currentState: EntryState.IDLE,
            },
          },
        },
      },
    },
  };
}

function validateDispatchPlan(dispatchPlan: readonly RuntimeDispatchItem[], errors: string[]): void {
  const dispatchIds = dispatchPlan.map((item) => item.dispatchId);
  validateUniqueValues(dispatchIds, 'dispatchPlan must not contain duplicate dispatchId', errors);

  const orders = dispatchPlan.map((item) => item.executionOrder);
  validateUniqueNumericValues(orders, 'executionOrder must be unique', errors);
  validateSequentialOrdersFromOne(orders, errors);

  for (const item of dispatchPlan) {
    if (!isRuntimeDispatchStatus(item.dispatchStatus)) {
      errors.push(`invalid dispatchStatus: ${String(item.dispatchStatus)}`);
    }
    if (typeof item.dispatchId !== 'string' || item.dispatchId.length === 0) {
      errors.push('dispatchId must be a non-empty string');
    }
    if (typeof item.actionId !== 'string' || item.actionId.length === 0) {
      errors.push('actionId must be a non-empty string');
    }
    if (!isRecord(item.metadata)) {
      errors.push('metadata must be an object');
    }
  }
}

/**
 * Validates runtime dispatcher context — action runtime integrity.
 */
export function validateRuntimeDispatcherContext(
  context: RuntimeDispatcherContext,
): RuntimeDispatcherContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.actionRuntimeResult === undefined) {
    errors.push('Missing actionRuntimeResult');
    return { valid: false, errors };
  }

  const actionRuntimeResult = context.actionRuntimeResult;

  if (!isRecord(actionRuntimeResult)) {
    errors.push('actionRuntimeResult must be an object');
    return { valid: false, errors };
  }

  if (typeof actionRuntimeResult.halted !== 'boolean') {
    errors.push('actionRuntimeResult.halted must be boolean');
  } else if (actionRuntimeResult.halted) {
    errors.push('actionRuntimeResult is halted');
  }

  if (!isRecord(actionRuntimeResult.context)) {
    errors.push('actionRuntimeResult.context must be an object');
  } else {
    const runtimeValidation = validateActionRuntimeContext(actionRuntimeResult.context);
    if (!runtimeValidation.valid) {
      for (const err of runtimeValidation.errors) {
        errors.push(`actionRuntimeResult.context: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates runtime dispatcher result — dispatchCount, order, status integrity.
 */
export function validateRuntimeDispatcherResult(
  result: RuntimeDispatcherResult,
): RuntimeDispatcherResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!Array.isArray(result.dispatchPlan)) {
    errors.push('dispatchPlan must be an array');
    return { valid: false, errors };
  }

  if (result.dispatchCount !== result.dispatchPlan.length) {
    errors.push('dispatchCount must match dispatchPlan.length');
  }

  validateDispatchPlan(result.dispatchPlan, errors);
  validateHaltedCountConsistency(result.halted, result.dispatchCount, 'dispatchCount', errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Builds dispatch plan from runtime actions — **does not execute**.
 */
export function buildDispatchPlan(
  actionRuntimeResult: ActionRuntimeResult,
): readonly RuntimeDispatchItem[] {
  return actionRuntimeResult.runtimeActions.map((runtimeAction) => ({
    dispatchId: buildDispatchId(runtimeAction.executionOrder),
    actionId: runtimeAction.actionId,
    executionOrder: runtimeAction.executionOrder,
    dispatchStatus: resolveDispatchStatus(runtimeAction),
    metadata: {
      actionType: runtimeAction.actionType,
      fromState: runtimeAction.metadata.fromState,
      toState: runtimeAction.metadata.toState,
      reason: runtimeAction.metadata.reason,
    },
  }));
}

function buildDispatcherMessage(
  halted: boolean,
  errors: readonly string[],
  dispatchCount: number,
): string {
  if (halted && errors.length > 0) {
    return errors.join('; ');
  }
  if (dispatchCount === 0) {
    return 'No dispatch items planned — scaffold only (Task 02.6.5)';
  }
  return `Planned ${dispatchCount} dispatch item(s) — scaffold only (Task 02.6.5)`;
}

/**
 * Builds runtime dispatcher result — validate, plan, return without execution.
 */
export function buildRuntimeDispatcherResult(
  context: RuntimeDispatcherContext,
): RuntimeDispatcherResult {
  const validation = validateRuntimeDispatcherContext(context);
  const actionRuntimeResult = context.actionRuntimeResult ?? createMissingActionRuntimeFallback();
  const halted = !validation.valid;
  const dispatchPlan = validation.valid ? buildDispatchPlan(actionRuntimeResult) : [];
  const dispatchCount = dispatchPlan.length;

  return {
    actionRuntimeResult,
    dispatchPlan,
    dispatchCount,
    halted,
    message: buildDispatcherMessage(halted, validation.errors, dispatchCount),
    context,
  };
}

/** Namespace for discoverability. */
export const RuntimeDispatcher = {
  buildRuntimeDispatcherResult,
  buildDispatchPlan,
  buildDispatchId,
  validateRuntimeDispatcherContext,
  validateRuntimeDispatcherResult,
  isRuntimeDispatchStatus,
} as const;
