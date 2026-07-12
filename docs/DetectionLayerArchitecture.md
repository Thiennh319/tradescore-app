# Detection Layer Architecture — Entry State Manager

**Module:** `services/entryStateManager/`  
**Version:** 0.6.2  
**Status:** FROZEN (Task 02.4.R — 2026-07-11)  
**RuleBook:** V2.0.0 (LOCKED)

---

## Overview

The Detection Layer reads **existing** Rule Engine output and integration hints. It produces **Evidence** only — no decisions, no state transitions, no Rule Engine re-evaluation.

```
Rule Engine
      ↓
NormalizedRuleOutput
      ↓
Trigger Detection
      ↓
┌──────────┬──────────┬──────────┬──────────────┬───────┐
│ HardBlock│ Recovery │  Unlock  │ Confirmation │ Noise │
└──────────┴──────────┴──────────┴──────────────┴───────┘
      ↓
Trigger Aggregator (Task 02.5 — not yet implemented)
      ↓
Priority Resolver
      ↓
Conflict Resolver
      ↓
State Machine
```

---

## Detector Responsibilities

| Detector      | Priority | sourceModule        | auditLabel           | Input boundary                          |
|---------------|----------|---------------------|----------------------|-----------------------------------------|
| HardBlock     | 100      | RuleEngine          | ENTRY_BLOCK          | `NormalizedRuleOutput` (direct)         |
| Recovery      | 70       | RuleEngine          | ENTRY_RECOVERY       | `RecoverySignalSnapshot` hints          |
| Unlock        | 70       | EntryStateManager   | ENTRY_UNLOCK         | `UnlockSignalSnapshot` hints          |
| Confirmation  | 60       | EntryStateManager   | ENTRY_CONFIRM        | `ConfirmationSignalSnapshot` hints    |
| Noise         | 50       | CVDFilter           | ENTRY_NOISE_FILTER   | `NoiseSignalSnapshot` hints             |

All metadata (`triggerId`, `priority`, `sourceModule`, `auditLabel`, `ruleReference`) is sourced exclusively from `TRIGGER_TYPE_CATALOG` in `triggerDetectionCatalog.ts`.

---

## Standard Detector Pipeline

Each runtime detector follows the same logical stages:

```
Context
    ↓
Validate (validateXXXDetectionContext)
    ↓
Signal Adapter (field copy — or NormalizedRuleOutput for HardBlock)
    ↓
Evidence Builder (buildXXXEvidence…)
    ↓
Evidence Dedupe (inside builder)
    ↓
Detection Result (detected = evidence.length > 0)
```

### HardBlock adapter variation

HardBlock does **not** use a separate `*SignalAdapter` module. Its adapter boundary is `normalizeRuleOutput()` / `NormalizedRuleOutput` — the Rule Engine output is already normalized before detection. Evidence is built via `buildHardBlockEvidenceFromRuleOutput()`.

All other detectors use `adaptXXXSignalsFromContext()` for field-copy passthrough from integration hints.

---

## What Detectors MUST NOT Do

- **No Decision logic** — detectors never choose READY / WATCH / LOCKED / BLOCKED.
- **No Transition execution** — detectors never call the State Machine or write store/journal.
- **No Rule Engine runtime** — detectors never import or invoke scorer, adxGate, or rule evaluation.
- **No `decision` field for detection** — `normalizedRuleOutput.decision` is validated structurally only; hint-based detectors ignore it entirely.

Detectors **only create Evidence**.

---

## Dependency Direction

```
Rule Engine (upstream — not imported by detectors)
      ↓
NormalizedRuleOutput (adapter boundary)
      ↓
Detector modules (entryStateManager/*)
```

- **0 production runtime imports** from detectors to Rule Engine / scorer / scan path.
- All detector imports are intra-module (`./triggerDetectionCatalog`, `./normalizedRuleOutput`, etc.).
- `FEATURE_FLAG = ENTRY_STATE_MANAGER_ENABLED` — module not wired to production scan.

---

## Validation Contract

Each detector exports:

- `validateXXXDetectionContext()` — structural checks + catalog metadata assertions
- `validateXXXDetectionResult()` — post-detection invariants:
  - `detected === (evidence.length > 0)`
  - `evidenceCount === evidence.length`
  - `originRuleIds` synced with evidence rows
  - evidence already deduped
  - `priority`, `sourceModule`, `auditLabel` match `TRIGGER_TYPE_CATALOG`

---

## Origin Rule ID Taxonomy

| Family | Pattern                         | Runtime usage                          |
|--------|---------------------------------|----------------------------------------|
| HB-*   | `HB-(CRIT\|HIGH\|MED\|LOW)-NN` | HardBlock — RuleBook §6 taxonomy       |
| NB-*   | `NB-(LOW\|MED\|HIGH)-NN`        | Noise — `null` until RuleBook adds IDs |
| CF-*   | `CF-(LOW\|MED\|HIGH)-NN`        | Confirmation — `null` at runtime       |
| RC-*   | `RC-(LOW\|MED\|HIGH)-NN`        | Recovery — `null` at runtime           |
| UL-*   | `UL-(LOW\|MED\|HIGH)-NN`        | Unlock — `null` at runtime             |

Shared validator: `originRuleIdValidation.ts` — `isValidOriginRuleId(id, family)`.

Per-detector validators delegate to the shared module; public API unchanged.

---

## Public API & Freeze

Exported from `services/entryStateManager/index.ts`.

Freeze constants (`detectionLayerFreeze.ts`):

- `DETECTION_LAYER_API_STATUS = 'FROZEN'`
- `DETECTION_LAYER_FROZEN_VERSION = '0.6.2'`
- `DETECTION_LAYER_FROZEN_DATE = '2026-07-11'`

### Frozen contracts (no changes except critical bugs)

- Context interfaces (`*DetectionContext`)
- Result interfaces (`*DetectionResult`)
- Evidence builder contracts
- Signal adapter contracts (field-copy only)
- Metadata contract (`TRIGGER_TYPE_CATALOG`)

### Allowed post-freeze changes

- Typos, comments, documentation
- Small validator unification (no API break)
- Export consistency
- Metadata consistency fixes

### Not allowed post-freeze

- New rules or trigger types
- Priority changes
- Runtime / detector flow changes
- Decision or transition logic in detectors
- State machine logic in detection layer

---

## Test Coverage

`npx vitest run services/entryStateManager/` — **75 tests**, 8 files.

| Test file                         | Tests | Coverage areas                          |
|-----------------------------------|-------|-----------------------------------------|
| hardBlockDetectionEngine.test.ts  | 10    | Context, validation, evidence, metadata |
| noiseDetectionEngine.test.ts      | 13    | Context, validation, dedupe, hints      |
| confirmationDetectionEngine.test.ts | 12  | Context, validation, evidence           |
| recoveryDetectionEngine.test.ts   | 12    | Context, validation, evidence           |
| unlockDetectionEngine.test.ts     | 12    | Context, validation, evidence           |
| triggerDetectionEngine.test.ts    | 6     | Catalog, placeholder aggregator         |
| stateValidator.test.ts            | 6     | Transition matrix validation            |
| evaluationPipeline.test.ts        | 4     | Pipeline diagram / step specs           |

---

## Next Step

**Task 02.5 — Trigger Aggregator** consumes detection results from all five detectors, applies priority/conflict resolution, and feeds the State Machine. The aggregator does not exist yet.
