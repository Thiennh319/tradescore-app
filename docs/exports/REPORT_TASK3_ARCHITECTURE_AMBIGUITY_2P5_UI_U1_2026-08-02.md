# TASK 3/3 — Đề xuất kiến trúc: Ambiguity thr=2.5 (4 coin) + UI U1

**Ngày:** 2026-08-02  
**Phạm vi:** CHỈ kiến trúc — **không code**, chờ duyệt trước implement.  
**Quyết định đã duyệt (Task 1–2):** threshold **1.0 → 2.5** chung 4 coin; UI **U1** (chỉ hướng `suggestDirectionV4` / `snap.direction` được enter).

---

## PHẦN 1 — Đổi threshold

### 1.1 SSOT giá trị

| Mục | Chi tiết |
|-----|----------|
| File | `services/directionAmbiguity.ts` dòng ~2 |
| Hiện tại | `export const AMBIGUOUS_THRESHOLD = 1.0` |
| Đề xuất | `AMBIGUOUS_THRESHOLD = 2.5` |
| Phạm vi symbol | **Mọi symbol** — constant dùng chung, **không** nhánh NEAR-only |
| Chủ ý | Khác gate S1 (`nearV4LayerGates` / `scorerV4`) vốn chỉ NEAR SHORT. Đây là **thay đổi shared có chủ ý**, đã duyệt qua sweep Task 2 |

Logic so sánh vẫn: `scoreDiff = |longScore − shortScore|`; `isCurrentlyAmbiguous = scoreDiff < AMBIGUOUS_THRESHOLD` (strict `<`).

### 1.2 Ảnh hưởng V3 — **CẢNH BÁO**

`signalBoardScan.ts` gọi **cùng** `resolveDirectionAmbiguity` cho cả hai engine:

- V4: ~1121–1126 (`longScoreV4` / `shortScoreV4`)
- V3: ~1131–1136 (`longScoreV3` / `shortScoreV3`)

→ Đổi `AMBIGUOUS_THRESHOLD` **ảnh hưởng V3 và V4** mỗi lần scan (hai store hysteresis riêng `ambiguityStores.v3` / `.v4`, nhưng **cùng ngưỡng**).

Toàn bộ Task 1–2 chỉ đo **V4**. **Chưa có** sweep/BT V3 @ 2.5.

**Khuyến nghị kiến trúc:**

- **Mặc định (đơn giản, khớp duyệt “chung 4 coin”):** đổi constant → V3+V4 cùng 2.5; ghi rõ risk V3 chưa đo trong release note / test smoke V3 board.
- **Nếu muốn cô lập V4 (phức tạp hơn, chỉ khi duyệt thêm):** thêm param `threshold` vào `resolveDirectionAmbiguity` hoặc constant riêng `AMBIGUOUS_THRESHOLD_V4` — **ngoài** phạm vi quyết định hiện tại; không đề xuất trừ khi user yêu cầu tách V3.

### 1.3 Hysteresis 2-scan

**Không cần đổi** số scan (vào AMBIGUOUS sau 2 lần `|Δ| < thr` liên tiếp; thoát sau 2 lần clear).

Logic đếm `consecutiveAmbiguousCount` / `consecutiveClearCount` **độc lập** với giá trị ngưỡng — chỉ điều kiện “sát nhau” thay đổi khi thr = 2.5 (vùng ambiguous rộng hơn → dễ vào / khó thoát hơn về mặt điểm số).

### 1.4 Mọi nơi đọc threshold / ambiguity

| Nơi | Cách dùng | Sau đổi 2.5 |
|-----|-----------|-------------|
| `services/directionAmbiguity.ts` | Định nghĩa `AMBIGUOUS_THRESHOLD` | **Sửa 1 chỗ SSOT** |
| `services/signalBoardScan.ts` | `resolveDirectionAmbiguity(...)` V3+V4 → `applyAmbiguityToSnapshot` | Tự theo constant |
| `hooks/useSignalBoard.ts` | Giữ `Map` AmbiguityState (không đọc số thr) | Không đổi |
| `components/dashboard/SignalBoard.tsx` | Đọc `isAmbiguousDirection` / message (không đọc thr) | UI U1 dùng flag |
| `services/scanUnified.ts` | `!ambiguous` khi build `longSnapshot`/`shortSnapshot` | Tự theo snap sau scan |
| `scripts/backtest-v4-near-90d.ts` | thr=1.0 gọi production helper; thr khác mirror local | Production path thành 2.5; cập nhật comment/`DEFAULT_AMBIGUITY_THRESHOLD` khi implement (script only) |
| Export Trace 01–05 | Không hardcode thr; có thể hiện hard/canEnter từ snap | Không sửa file export |
| `entryStateManager/*` | Chỉ document — **không** gọi `directionAmbiguity` | Ngoài phạm vi |

**Không** có import trực tiếp `AMBIGUOUS_THRESHOLD` ngoài file định nghĩa (chỉ dùng nội bộ trong `resolveDirectionAmbiguity`). Đổi 1 constant → mọi caller helper đồng bộ.

---

## PHẦN 2 — UI U1

### 2.1 Hành vi nút (đề xuất cụ thể để duyệt)

**Khuyến nghị: hiện cả 2 nút; chiều không official = disabled + style mờ (không ẩn).**

| Nút | Điều kiện “active / sẵn sàng enter” | Click |
|-----|-------------------------------------|-------|
| Official (`side === snap.direction`) | `!isAmbiguous && isDirectionReady(side)` (và/hoặc `snap.canEnter` khi side khớp) | Mở modal như hiện tại |
| Non-official | Luôn **không** ready | `disabled`; không `setModalVisible` |

**Lý do chọn disabled+mờ vs ẩn:** user vẫn thấy cả hai điểm LONG/SHORT đang được tính; chỉ một hướng được khuyến nghị — khớp U1 Task 2.

**Điểm sửa chính** trong `SignalBoard.tsx` (~1332–1484, ~1520–1526):

```text
longBtnEnabled  = !isAmbiguous && snap.direction === 'LONG'  && isDirectionReady('LONG', ...)
shortBtnEnabled = !isAmbiguous && snap.direction === 'SHORT' && isDirectionReady('SHORT', ...)
```

Modal `canEnter` prop: chỉ `true` khi `modalDir === snap.direction && longBtnEnabled/shortBtnEnabled` tương ứng — không fallback `isDirectionReady` độc lập cho chiều phụ.

Highlight số (`longScoreActive` / `shortScoreActive`): nên cùng rule U1 (hoặc chỉ highlight official) để tránh hai màu “active”.

### 2.2 Khi `AMBIGUOUS` (thr 2.5)

**Hiện trạng engine:** `applyAmbiguityToSnapshot` → `isAmbiguousDirection=true`, `canEnter=false`; **không** đổi `snap.direction`.

**Hiện trạng UI:** badge/border ambiguous; message; ẩn một số CTA plan — nhưng `longReady`/`shortReady` **vẫn độc lập**, có thể cả hai nút trông “ready” dù không enter được qua `canEnter` primary.

**Đề xuất U1 + ambiguous (khớp gợi ý user):**

- **Cả 2 nút disabled/mờ** khi `isAmbiguous === true`
- Giữ badge / `ambiguousMessage` hiện có
- Không mở modal enter từ nút hướng

Hỗ trợ sẵn: flag `snap.isAmbiguousDirection` đã có trên row/snapshot — chỉ cần UI **gate** theo flag (hiện chưa gate nút).

### 2.3 Phạm vi sửa

| File / path | Cần sửa? | Ghi chú |
|-------------|----------|---------|
| `SignalBoard.tsx` | **Có — bắt buộc** | U1 + gate AMBIGUOUS |
| `TradePlanModal.tsx` | **Không bắt buộc** | Nhận `canEnter` từ parent; siết prop + không mở modal chiều phụ là đủ |
| `LayerCard.tsx` | Không | |
| `scanUnified.ts` | **Tùy chọn** | Đã `!ambiguous` → cả hai snapshot `canEnter=false` khi AMBIGUOUS — khớp ý “cả hai tắt”. Khi CLEAR, vẫn có thể `longCanEnter && shortCanEnter` độc lập |
| `unifiedSignalEngine.resolveV4Signal` | **Tùy chọn / khuyến nghị nhẹ** | Xem §2.4 |
| `SignalBoardUnified` / V41 | **Ngoài phạm vi** trừ khi muốn unify UX | Path riêng |

**Khuyến nghị phạm vi PR mặc định:** chỉ **SignalBoard (+ test UI nếu có)** cho U1; unified để nguyên hoặc follow-up nhỏ nếu board Unified đang ship song song.

### 2.4 `resolveV4Signal` (ưu tiên LONG)

Hiện: nếu cả `longSnapshot.canEnter` và short cùng true → chọn **LONG trước** — **không** gọi `suggestDirectionV4`.

| Lựa chọn | Ý |
|----------|---|
| **A — Để nguyên (khuyến nghị cho PR này)** | Path Unified/V4.1 merge riêng; board V4 thường không dùng `resolveV4Signal`. Giảm scope. Ghi tech-debt. |
| **B — Đồng bộ U1** | `v4Direction = row.direction` (đã từ `suggestDirectionV4` lúc scan) và chỉ `canEnter` nếu snapshot phía đó true; hoặc gọi lại `suggestDirectionV4` nếu có đủ scoring | Nhất quán cross-surface; sửa `unifiedSignalEngine` + test |

**Đề xuất Task 3 implement lần 1:** **A**. Nếu Unified đang là surface chính của user → duyệt thêm **B** trong cùng PR.

---

## PHẦN 3 — Kế hoạch implement + test (chưa code)

### 3.1 File cần sửa (thứ tự)

1. `services/directionAmbiguity.ts` — `1.0` → `2.5` (+ comment “shared V3+V4, Task 3 duyệt”)
2. `services/directionAmbiguity.test.ts` (**mới** hoặc bổ sung) — unit thr / hysteresis
3. `components/dashboard/SignalBoard.tsx` — U1 + AMBIGUOUS cả hai disabled
4. *(Khuyến nghị)* Cập nhật comment/`DEFAULT_AMBIGUITY_THRESHOLD` trong `scripts/backtest-v4-near-90d.ts` cho khớp live 2.5 (không bắt buộc cho APK)
5. *(Tùy chọn cùng PR)* `unifiedSignalEngine.ts` + test nếu chọn §2.4 B
6. Không đụng: `scorerV4.ts`, `nearV4LayerGates.ts`, export Trace formatter

### 3.2 Test bắt buộc trước merge

| # | Case |
|---|------|
| T1 | `AMBIGUOUS_THRESHOLD === 2.5` (export / assert) |
| T2 | `|Δ| < 2.5` → sau 2 scan CLEAR→AMBIGUOUS; `|Δ| ≥ 2.5` không vào ambiguous từ clear đơn lẻ |
| T3 | Hysteresis: 1 scan sát → vẫn CLEAR; scan 2 → AMBIGUOUS; 2 scan rõ → CLEAR |
| T4 | Cùng helper với điểm số giả lập “BTC/SOL/BNB/NEAR” (symbol-agnostic — constant không nhánh symbol) |
| T5 | UI/unit hoặc RTL: `direction=SHORT` → chỉ short enabled khi `!ambiguous && ready`; long disabled |
| T6 | `isAmbiguousDirection=true` → cả 2 nút disabled / không mở modal |
| T7 | NEAR S1 regression: `nearShortL3HardBlockReason` / `resolveNearShortL3Gate` vẫn hard khi L3&lt;1.5 SHORT; ambiguity không xóa hard block S1 (hai lớp độc lập: S1 trong scorer hardBlocks; ambiguity chỉ `canEnter` snapshot) |
| T8 | *(Nếu có V3 smoke)* scan snapshot V3 cũng nhận thr 2.5 — ít nhất 1 test `resolveDirectionAmbiguity` dùng chung |

### 3.3 Một PR hay hai PR?

| | 1 PR (threshold + UI) | 2 PR (threshold rồi UI) |
|--|----------------------|-------------------------|
| Ưu | Một APK; UX khớp ngay với thr rộng hơn (tránh kỳ thr mới nhưng vẫn 2 nút ready) | Rollback UI dễ; review nhỏ hơn |
| Nhược | Diff hai concern | 2 build; thr 2.5 ship trước khi U1 → **tăng** vùng ambiguous nhưng UI vẫn dễ hiểu nhầm 2 nút ready |

**Khuyến nghị: 1 PR** — cả hai phần nhỏ (constant + gate nút SignalBoard); rủi ro chính là **V3 chung ngưỡng** (đã cảnh báo), không phải kích thước diff. Tách 2 PR chỉ nếu muốn ship thr lên store/OTA trước khi xong UI (không khuyến nghị cho bản APK “đúng UX”).

---

## Tóm tắt chờ duyệt

1. Đổi `AMBIGUOUS_THRESHOLD` **1.0 → 2.5** tại `directionAmbiguity.ts` — shared **V3+V4**, 4 coin, chủ ý.  
2. Hysteresis 2-scan **giữ nguyên**.  
3. UI U1: **2 nút hiện; non-official + AMBIGUOUS → disabled/mờ**; siết `canEnter` modal.  
4. Phạm vi mặc định: `directionAmbiguity` + `SignalBoard` (+ tests); Unified **để nguyên** trừ khi duyệt thêm.  
5. **1 PR** gộp threshold + U1.  

**Chờ xác nhận kiến trúc** (đặc biệt: chấp nhận ảnh hưởng V3; chọn disabled+mờ; Unified A vs B) trước khi cho phép implement.
