# Xác minh 25 fail exportTraceReviewWire* trước V3V4-DATA-BUILD

**Ngày:** 2026-08-08  
**Mục đích:** Chứng minh 25 fail **không** phải regression từ V4-EXPORT-1 (`12144a1`) hay V3V4-DATA-2a→2e (`a253036`).

---

## Kết luận

**Pre-existing, khớp 1-1 với baseline VERIFY lúc sáng 2026-08-07 (trước commit V4-EXPORT-1).**  
Không block ship DATA-BUILD.

---

## Timeline

| Mốc | Thời điểm | Ý nghĩa |
|-----|-----------|---------|
| Baseline full vitest + fail list | **2026-08-07 10:01** | `_full_vitest_baseline_nobugfix_2026-08-07.json`, `_verify_baseline_fail_tests.txt` |
| V4-EXPORT-1 commit | **2026-08-07 19:08** | `12144a1` — `pickFrozenRow(..., context.coin)` |
| VERIFY markdown viết lại | 2026-08-08 ~07:46 | File báo cáo; **dữ liệu fail** vẫn từ baseline 10:01 |
| DATA 2a–2e commit | 2026-08-08 08:57 | `a253036` — không đụng `exportTraceReviewWire.ts` |

---

## Đối chiếu tên test case

| So sánh | Kết quả |
|---------|---------|
| HEAD hiện tại (6 file) fail count | **25** |
| Baseline list cùng 6 file | **25** |
| both / onlyHead / onlyBaseline | **25 / 0 / 0** |

Worktree A/B:

| Commit | Kết quả 6 file |
|--------|----------------|
| `471384b` (parent, **trước** V4-EXPORT-1) | **25 failed \| 12 passed** |
| `12144a1` (V4-EXPORT-1) | **25 failed \| 12 passed** |
| Diff titles only-AT / only-BEFORE | **0 / 0** |

Ví dụ assertion (không liên quan coin-pick): `expected 'HARD' to be 'SOFT'` (L5a Block Type).

---

## Về “PASS” trong báo cáo V4-EXPORT-1-BUILD

Suite lúc đó **chỉ**:

- `exportAuditCoin.test.ts`
- `exportTraceReviewWire.test.ts`
- `exportTraceReviewWire.selfdoc.test.ts`
- `exportRuleScoreBundle.test.ts`
- `aiExport.test.ts`  
→ **5 files / 37 PASS** — **không** gồm `l5aBlockTypeSoft` / `task188` / `positionAdviserWire` / …

→ Báo cáo trước **không sai** trong phạm vi đã chạy; cũng **không** chứng minh 6 file kia xanh.

---

## Liên quan DATA 2a→2e?

`git show a253036 --stat` — không sửa `exportTraceReviewWire.ts`. Fail logic (SOFT/HARD, BLOCKING EVENTS ORIGIN, Position Trace wire) nằm ngoài rate-limit pipeline.
