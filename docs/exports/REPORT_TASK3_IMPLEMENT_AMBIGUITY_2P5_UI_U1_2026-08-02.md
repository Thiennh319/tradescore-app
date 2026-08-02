# TASK 3 IMPLEMENT — Ambiguity 2.5 + UI U1 (chờ build)

**Ngày:** 2026-08-02  
**Trạng thái:** Code + test xong — **CHƯA** build APK, **CHƯA** merge.

---

## File đã sửa / thêm

| File | Việc |
|------|------|
| `services/directionAmbiguity.ts` | `AMBIGUOUS_THRESHOLD` **1.0 → 2.5** + comment shared V3+V4 / TASK3 report |
| `components/dashboard/SignalBoard.tsx` | U1: `longBtnEnabled`/`shortBtnEnabled`; disabled+mờ; modal `canEnter`; highlight đồng bộ |
| `components/dashboard/signalBoardU1.ts` | **Mới** — pure `isU1DirectionButtonEnabled` (tách khỏi SignalBoard để unit test không kéo Expo) |
| `services/unifiedSignalEngine.ts` | Comment TODO Option A / §2.4 (không đổi logic) |
| `scripts/backtest-v4-near-90d.ts` | `DEFAULT_AMBIGUITY_THRESHOLD = AMBIGUOUS_THRESHOLD` (live 2.5) |
| `services/directionAmbiguity.task3.test.ts` | **Mới** — T1–T8 |

**Không đụng:** `scorerV4.ts`, `nearV4LayerGates.ts`, logic `resolveV4Signal`, Trace 01–05.

---

## Kết quả test

### Suite liên quan (7 files)

```
Test Files  7 passed (7)
Tests       90 passed (90)
```

| File | Kết quả |
|------|---------|
| `services/directionAmbiguity.task3.test.ts` | **PASS** (T1–T8) |
| `config/nearV4LayerGates.test.ts` | **PASS** (S1 gate) |
| `services/__tests__/ruleTraceBlockTypeInvariant.test.ts` | **PASS** |
| `services/__tests__/exportTraceReviewWire.nearShortL3GateEvidence.test.ts` | **PASS** |
| `services/__tests__/aiReviewSpecification.blockTypeResolution.test.ts` | **PASS** |
| `services/__tests__/unifiedSignalEngine.test.ts` | **PASS** |
| `config/featureFlags.test.ts` | **PASS** |

### T1–T8

| Case | Pass? |
|------|-------|
| T1 thr === 2.5 | YES |
| T2 \|Δ\|&lt;2.5 trigger / ≥2.5 không | YES |
| T3 hysteresis 2-scan | YES |
| T4 4 symbol cùng helper | YES |
| T5 U1 chỉ official enabled | YES |
| T6 AMBIGUOUS → cả 2 disabled | YES |
| T7 NEAR S1 độc lập ambiguity | YES |
| T8 V3 share helper smoke | YES |

---

## Bất ngờ khi code

1. **Import `isU1…` từ `SignalBoard.tsx` trong vitest** → kéo Expo (`__DEV__` / file-system) fail. **Giải pháp:** tách pure helper sang `signalBoardU1.ts` (SignalBoard import lại) — hành vi U1 không đổi.
2. Không phát hiện regression S1 / unified tests.

---

## Chờ lệnh tiếp

Sẵn sàng khi bạn duyệt: **build APK / merge** (task riêng). Không tự chạy build/merge trong bước này.
