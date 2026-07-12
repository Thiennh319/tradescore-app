# Entry State Manager (ESM)

**Module:** `services/entryStateManager`  
**Module version:** `0.1.1` (Task 02.1.1)  
**RuleBook:** V2.0.0 — LOCKED  
**Engine target:** TradeScore V1.0.5

---

## Mục đích

Entry State Manager chuẩn hóa **trạng thái vào lệnh** (READY / WATCH / LOCKED / BLOCKED) theo RuleBook V2, nằm **sau Rule Engine** và **trước Entry Engine**.

Mục tiêu dài hạn:

- Giảm nhiễu do quét 60s (hysteresis)
- Khóa setup khi giá tiến gần entry (setup lock)
- Xuất audit nhất quán cho AI review

**Task 02.1 / 02.1.1:** Chỉ scaffold — types, enums, metadata, error codes, tài liệu. **Không có runtime.**

---

## Phạm vi trách nhiệm

| Thuộc ESM (tương lai) | Không thuộc ESM |
|------------------------|-----------------|
| State machine READY/WATCH/LOCKED/BLOCKED | Tính điểm layer (Score Engine) |
| Hysteresis counters per symbol | Hard block / group block evaluation |
| Setup lock zone & LOCKED semantics | Trade plan geometry (Entry/SL/TP) |
| Commit score metadata (audit only) | Position Adviser, CVD, Whale |
| Audit export fields (§7 RuleBook) | UI rendering, journal persistence |

---

## Không được làm (RuleBook §8, §9)

ESM **không được**:

- Gọi lại EMA, CVD, Momentum, MACD, RSI, ADX
- Tính `officialTotalScore` hoặc `canEnter`
- Sửa Score Engine, Rule Engine, Entry Engine
- Tham gia quyết định giao dịch ở scaffold stage
- Import UI, React, Store, Position Adviser, CVD, Whale

---

## Dependency

### Nội bộ module

```
index.ts
  ├── metadata.ts
  ├── constants.ts  → metadata, enums, types
  ├── enums.ts
  ├── types.ts      → enums
  ├── audit.ts      → enums, types
  ├── errorCodes.ts
  └── hardBlockIds.ts
```

### Phụ thuộc bên ngoài

**Không có.** Module không import bất kỳ file nào ngoài `services/entryStateManager/`.

### Phụ thuộc ngược (ai dùng ESM)

**Chưa có** — module chưa được tích hợp production.

---

## Feature Flag

| Key | Default | Mô tả |
|-----|---------|-------|
| `ENTRY_STATE_MANAGER_ENABLED` | `false` (chưa wired) | Bật ESM trên scan path |

Constant: `FEATURE_FLAG` / `ESM_FEATURE_FLAG_KEY` (alias).

Khi flag tắt: app chạy y như V1.0.5 (`FinalEntryStatus` only) — RuleBook §9.5.

---

## Version metadata

| Constant | Giá trị |
|----------|---------|
| `MODULE_NAME` | `EntryStateManager` |
| `MODULE_VERSION` | `0.1.1` |
| `RULEBOOK_VERSION` | `RuleBook V2.0.0` |
| `AUDIT_VERSION` | `audit-v2.1` |
| `FEATURE_FLAG` | `ENTRY_STATE_MANAGER_ENABLED` |

Bundled: `ESM_MODULE_METADATA`.

---

## Error codes

| Code | Label |
|------|-------|
| `ESM_001` | Invalid Transition |
| `ESM_002` | Unknown State |
| `ESM_003` | Invalid Lock |
| `ESM_004` | Invalid Commit Score |
| `ESM_005` | Rule Violation |
| `ESM_006` | Feature Disabled |

Enum: `EsmErrorCode` — định nghĩa only; chưa throw/handle.

---

## Kiến trúc tích hợp dự kiến

RuleBook §8.2:

```
Indicators → Score Engine → Rule Engine → ESM → Entry Engine → Journal
```

Điểm hook (Task sau):

| File | Hành động |
|------|-----------|
| `signalBoardScan.ts` | Sau `enrichSnapshotFinalStatus` |
| `scanV41.ts` | Sau visibility/opportunity |
| `scanUnified.ts` | Merge V4 + V41 ESM state |
| `useLockedPlanMonitor` | Sync LOCKED ↔ `LockedTradePlan` |
| `exportService.ts` | SECTION: ENTRY STATE (ESM) |

---

## Task liên quan

| Task | Nội dung |
|------|----------|
| 01.x | RuleBook V2 — LOCKED |
| **02.1** | Scaffold types/enums/constants |
| **02.1.1** | README, metadata, error codes, JSDoc |
| 02.2 | State machine + transitions |
| 02.3 | Hysteresis counter persistence |
| 02.4 | Setup lock zone evaluator |
| 02.5 | Integration + feature flag + export |

---

## Public API

Import:

```typescript
import {
  EntryState,
  MODULE_VERSION,
  FEATURE_FLAG,
  EsmErrorCode,
} from './services/entryStateManager';
```

Xem JSDoc trên từng export trong source files.

---

*Documentation only at Task 02.1.1 — no production behavior change.*
