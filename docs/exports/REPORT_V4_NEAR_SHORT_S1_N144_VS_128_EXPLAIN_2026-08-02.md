# REPORT — Giải thích n SHORT 144 (engine S1) vs 128 (post-filter CSV)

**Date:** 2026-08-02  
**Chỉ giải thích — không sửa code.**  
**JSON chi tiết:** `docs/exports/near_v4_s1_n144_vs_128_explain.json`

---

## Tóm tắt

| | Giá trị |
|---|---|
| Old SHORT `l3≥1.5` (post-filter CSV CVD220) | **128** |
| Engine S1 SHORT (CSV `…_cvd220_s1`) | **144** |
| **Net Δ** | **+16** |
| Giao theo `entryTime` | **116** chung · **+28** chỉ S1 · **−12** mất khỏi filter cũ |
| Kiểm tra: `+28 − 12 = +16` | ✅ |

**Nguyên nhân chính:** không phải “lách” hard/group block khác, cũng không chủ yếu do `suggestDirection` đổi LONG→SHORT.  
Là **hiệu ứng chiếm chỗ / rising-edge** của runner backtest: chặn SHORT L3=1 sớm → không `inPosition` → bar sau (L3≥1.5) được vào thay thế.

---

## 1. 144 lệnh có “lách” block khác không?

Runner chỉ ghi lệnh khi **cùng lúc**:

- `canEnterV4(active)` (hardBlocks + blockReasons + groupBlocks + decision OK)
- `plan.isValid && plan.tradePlanValid`
- rising-edge `canEnter`

Trên CSV S1 SHORT (n=144):

| Kiểm tra | Kết quả |
|---|---|
| `L3 < 1.5` | **0** |
| `tradePlanValid ≠ 1` | **0** |
| Group A min trên mẫu | ≥ **2.5** (đúng floor shared) |
| Group B min | ≥ **2.06** (≥ 2.0) |
| Group C min | ≥ **2.5** (≥ 2.0) |

→ Không có lệnh nào trong 144 “chỉ qua L3 mà fail rule khác rồi vẫn vào”.  
CSV không lưu đầy đủ chuỗi hard-block text, nhưng điều kiện vào lệnh của runner **đã yêu cầu** pass toàn bộ gate lúc entry — tương đương baseline cũ ngoài thêm S1.

So với baseline cũ: các lệnh “mới” **không** phải lệnh từng bị block bởi rule khác trên cùng timestamp rồi bỗng pass; hầu hết **không tồn tại** trên CSV cũ cùng `entryTime` (slot trước đó đã bị chiếm bởi SHORT L3=1).

---

## 2. 16 lệnh chênh đến từ đâu? (cơ chế)

### Công thức tập

```
144 = 116 (trùng entryTime với old l3≥1.5) + 28 (chỉ S1)
128 = 116 + 12 (chỉ old filter, mất trên S1)
Δ = 28 − 12 = 16
```

### Cơ chế runner (quan trọng)

```text
Bar t:  suggest SHORT, L3=1
  - Baseline cũ: canEnter ↑ → vào SHORT → inPosition vài giờ
  - S1: hard block NEAR SHORT L3<1.5 → KHÔNG vào → không chiếm slot

Bar t+k: L3 lên 1.5 hoặc 2, rising-edge lại
  - Baseline cũ: đang inPosition / hoặc prevCanEnter đã “đã vào” → bỏ qua / timestamp khác
  - S1: rảnh → vào SHORT tại t+k  ← đây là lệnh “mới” trong 28
```

Bằng chứng mẫu (lặp lại trên hầu hết 28 lệnh only-S1): trong ±6h trước đó, CSV cũ có SHORT **L3=1** gần đó.

Ví dụ:

| S1 mới (L3≥1.5) | Gần đó trên baseline cũ |
|---|---|
| 2026-02-09 07:00 L3=1.5 | 06:00 SHORT **L3=1** |
| 2026-02-11 05:00 L3=2 | 03:00 SHORT **L3=1** |
| 2026-02-23 16:00 L3=2 | 15:00 SHORT **L3=1** |
| 2026-06-14 15:00 L3=1.5 | 14:00 SHORT **L3=1** |
| 2026-07-28 13:00 L3=2 | 11:00 SHORT **L3=1** |

**12 lệnh mất** (có trên filter cũ, không trên S1): thường là entry L3≥1.5 **muộn hơn trong cùng cụm** — S1 đã vào sớm hơn ở bar khác → chiếm slot → timestamp cũ không còn rising-edge / còn đang hold.

**Không thấy** bằng chứng chính: cùng bar đổi từ LONG entered → SHORT entered. LONG n vẫn **29 = 29**. Phần lớn chênh là **SHORT↔SHORT** tái định thời trong cụm L3=1 → L3≥1.5.

---

## 3. 28 lệnh “mới” kéo WR ảo không?

| Tập | n | WR% | EV |
|---|---:|---:|---:|
| Toàn SHORT S1 | 144 | **76.39** | +0.45 |
| Trùng với old l3≥1.5 | 116 | 75.00 | +0.43 |
| **Chỉ S1 (28 “mới”)** | 28 | **82.14** | +0.50 |
| Chỉ old (12 mất) | 12 | 75.00 | +0.51 |

→ Nhóm mới **WR cao hơn** trung bình 76.4%, không phải cụm thua kéo WR lên giả.  
Net +16 vẫn lành: thay SHORT yếu L3=1 bằng SHORT L3≥1.5 (thường mạnh hơn), đúng ý S1.

---

## 4. Kết luận cho duyệt build

1. **144 không “lỏng” rule khác** — vẫn canEnter + tradePlanValid đầy đủ; L3≥1.5 tuyệt đối.  
2. **Δ +16 = hiệu ứng lịch sử vị thế / rising-edge**, không phải bug gate hay đổi LONG hàng loạt.  
3. **Lệnh mới không kéo WR xấu** — WR nhóm mới 82% > baseline S1 76%.  
4. So sánh **144 vs 128** không apples-to-apples: 128 = cắt tĩnh CSV; 144 = mô phỏng động có S1. Con số tin cậy cho live là **144 / ~76% WR** sau S1.

**Không cần sửa thêm trước build** — trừ khi muốn đo lại bằng metric cố định (vd. “số bar canEnter SHORT” thay vì số lệnh sau occupancy).
