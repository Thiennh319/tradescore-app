# REPORT — Điều tra 100% SHORT / 0% LONG (NEAR V4, 180d)

**Date:** 2026-08-02  
**Phạm vi:** Điều tra + báo cáo — **KHÔNG** sửa code/constants.  
**Nguồn:**
- CSV baseline: `docs/exports/near_backtest_180d.csv` (+ rerun `near_backtest_180d_rerun_longcheck.csv`)
- Phân tích độc lập: `docs/exports/near_v4_180d_long_zero_investigate.json`
- Script: `scripts/investigate-near-180d-long-zero.ts` (cùng fetch kline + CVD như backtest)

---

## Verdict (tóm tắt)

**(c) Cả hai — nhưng không phải bug “nhánh LONG chết / thiếu 4H MACD”.**

1. **Thị trường không phải downtrend áp đảo 80–90%:** giá NEAR **+~44%** trên 180d; ngày giảm ~57%, EMA4h DOWN/UP gần cân (~45% / ~42%).
2. **Rule/CVD khiến LONG không bao giờ `canEnter` trên đúng pipeline backtest:** `longOk = 0 / 4318` bars; `shortOk = 387`. Rerun official backtest vẫn **86 SHORT / 0 LONG**.
3. **L3 MACD LONG (4H histogram) đang đúng** — không revert. Ở relief rally L3 LONG thường = 2.
4. **Nguyên nhân chính chặn LONG:** **L5a CVD** — CVD tích lũy từ klines trong cửa sổ backtest **âm sâu liên tục** (−46M → −125M tại các điểm rally). → soft-block `L5a < 1` (+ Group B) và/hoặc hard-block LONG-only `CVD deeply negative and still deteriorating.`  
   Cùng lúc, CVD âm sâu **thuận SHORT** (L5a SHORT thích CVD âm).

---

## PHẦN 1 — Giá thô (loại trừ “toàn bear” trước)

| Metric | Giá trị |
|---|---|
| Đầu kỳ close | ~1.19 (2026-02-03) |
| Cuối kỳ close | ~1.71 (2026-08-02) |
| **% thay đổi tổng** | **≈ +43.7% → +44.2%** |
| Ngày tăng / giảm / flat (±0.15%) | 75 / 102 / 3 (181 ngày) |
| % ngày giảm | **56.7%** (không phải >80–90%) |
| EMA20 slope 4H (UP / DOWN / FLAT) | **42.0% / 45.3% / 12.7%** |

**Relief rally ≥ +12% / 5 ngày (mẫu):**

| Ngày | Ret 5d | Close |
|---|---:|---:|
| 2026-05-25 | +62.8% | 2.77 |
| 2026-05-08 | +25.2% | 1.60 |
| 2026-06-15 | +21.5% | 2.39 |
| 2026-03-03 | +20.4% | 1.36 |
| 2026-06-03 | +18.4% | 2.82 |

**Kết luận sơ bộ Phần 1:** Không thể giải thích 0% LONG chỉ bằng “NEAR downtrend suốt 180d”. Có nhiều đợt hồi mạnh — hệ thống tốt vẫn **nên** bắt được vài LONG nếu gate công bằng. → Bắt buộc Phần 2–3.

---

## PHẦN 2 — Rà logic nhánh LONG

### 2.1 Không có kill-switch LONG / flag tắt LONG

- `suggestDirectionV4`: hard-block / awaiting / `KHONG_VAO` theo từng phía; **hòa điểm → chọn LONG** (`scorerV4.ts` ~1357–1367).
- `canEnterV4`: direction-agnostic.
- `tradePlanV4` / capital: không hard-code chặn LONG.
- Không có flag NEAR tắt LONG trên path V4.

### 2.2 L3 MACD — fix 4H LONG **đang có**

```341:357:services/scorerV4.ts
  if (direction === 'LONG') {
    if (h1 > 0 && h4 > 0) {
      return layerA(3, 2, 'Histogram dương cả 1H & 4H');
    }
    // ... macd4h.crossedZeroRecentlyUp / isTurningUp / h4 ...
```

Wire: `scoreL3V4(direction, macd1h, macd4h)` với `macd4h = getMACDAnalysisV3(input.klines4h)`.  
Spot-check rally: L3 LONG = 2 tại 4/5 điểm. **Không phải bug kiểu thiếu hist 4H.**

### 2.3 Asymmetry có thật — trọng tâm L5a CVD

| Cơ chế | LONG | SHORT | Hướng lệch |
|---|---|---|---|
| Hard CVD | `evaluateLongCvdHardBlock`: CVD &lt; −20M + momentum STRONG_BEARISH + giá &lt; EMA20 | CVD &gt; **+2M** hard block ngay | SHORT dễ bị hard-block hơn ở CVD dương; LONG hard-block chỉ khi “deep + deteriorating + dưới EMA” |
| Soft L5a | CVD âm sâu → **score 0** → `blockReasons` nếu score &lt; 1 | CVD âm + slope down → **score 2** | **CVD tích lũy âm giúp SHORT, giết LONG** |
| `CVD_LONG_HARD_BLOCK: -2M` trong `HARD_BLOCK_RULES_V4` | **Không dùng** cho hard-block LONG hiện tại | Dùng `CVD_SHORT_HARD_BLOCK: +2M` | Hằng −2M “mồ côi” — không phải nguyên nhân 0 LONG |
| Funding L6 | Mild positive → LONG 0.5 / SHORT 1.5 (thiếu mirror mild-short) | — | Lệch nhẹ, **không** đủ giải thích longOk=0 |
| L9 Asia Dead | Giống hai phía (~1080 bars) | Giống | Trung lập |
| Group A/B/C mins | Cùng ngưỡng | Cùng | Trung lập về hằng; fail Group B LONG vì L5a=0 kéo Group B xuống |

**Soft-block L5a (cả hai hướng):**

```1204:1206:services/scorerV4.ts
    if (l5aRes.layerResult.score < 1 && !l5aRes.hardBlock) {
      // → blockReasons → canEnter = false
```

### 2.4 Hard-block đếm trên 180d (bar-level)

**LONG top:** L9 Asia (1080) · **CVD deeply negative… (731)** · L3 hist âm cả 2 khung (626) · BTC ≤−2% (rải rác).

**SHORT top:** L3 hist dương cả 2 khung (1213) · L9 Asia (1080) · funding squeeze / BTC ≥+2% (rất ít).

→ Không có rule “cấm LONG”; có **lệch CVD** làm LONG gần như luôn fail L5a trong sample này.

---

## PHẦN 3 — Giả lập tại relief rally + canEnter độc lập

### 3.1 Độc lập hai hướng (đúng CVD / takerBuy)

| Metric | Giá trị |
|---|---:|
| Bars checked | 4318 |
| **longOk (`canEnter` LONG)** | **0 (0%)** |
| shortOk | 387 (8.96%) |
| bothOk | 0 |
| Rising LONG / SHORT | **0 / 104** |
| Official rerun trades | **0 LONG / 86 SHORT** |

`suggestDirection` vẫn chọn LONG trên ~2030 bars (điểm LONG cao hơn khi SHORT bị L3/CVD+), nhưng **LONG không vượt soft/hard gate** → backtest chỉ vào SHORT khi SHORT `canEnter`.

### 3.2 Spot-check 5 đỉnh hồi (cùng giờ ~12:00 UTC)

| Rally | Suggest | LONG canEnter | L1/L3/L5a LONG | Chặn chính LONG | SHORT |
|---|---|---|---|---|---|
| 2026-05-25 (+63%) | LONG | **false** | 2 / 2 / **0** | L5a CVD −66.9M recovering + Group B | L3 hard (hist+) |
| 2026-05-08 (+25%) | LONG | **false** | 2 / 2 / **0** | L5a CVD −72.6M + Group B | L3 hard |
| 2026-06-15 (+21%) | LONG | **false** | 2 / 2 / **0** | L5a CVD −125.0M + Group B | L3 + BTC |
| 2026-03-03 (+20%) | LONG | **false** | 2 / 1 / **0** | L5a CVD −46.1M + Group B | BTC block |
| 2026-06-03 (+18%) | LONG | **false** | 2 / 2 / **0** | BTC −2.8% + L5a −83.4M | L3 hard |

**Đọc nhanh:** Trend/MACD LONG **đã lên đủ** (L1/L3 thường 2). Điểm LONG **không bao giờ tiệm cận `canEnter`** vì L5a bị ghim 0 bởi CVD tích lũy âm sâu — kể cả giữa rally mạnh.

### 3.3 Tương tác với cách backtest dựng CVD

- Backtest truyền `cvdPoints = buildCVDPointsFromKlines(near1h.slice(0, i+1))` — CVD **tích lũy từ đầu chuỗi fetch**, không reset theo rolling ngắn.
- Trên 180d, CVD tuyệt đối có thể “ngâm” ở −50M…−120M suốt phần lớn cửa sổ.
- Live app thường chỉ giữ N nến gần nhất → CVD tương đối cửa sổ ngắn hơn; **0 LONG trên BT 180d có thể nặng hơn live** nếu live không tích lũy cùng độ dài. (Cần xác nhận độ dài kline live khi duyệt fix — chưa đo trong report này.)

---

## PHẦN 4 — Kết luận

### 8. Phân loại

| Giả thuyết | Kết luận |
|---|---|
| (a) Chỉ do downtrend thị trường | **Loại** — giá +44%, nhiều rally, EMA gần cân |
| (b) Bug nhánh LONG chết / thiếu MACD 4H | **Loại** — L3 LONG dùng `h4` đúng; L1/L3 lên 2 tại rally |
| **(c) Thị trường có pha bán + rule siết LONG không cân** | **Đúng** — CVD tích lũy âm sâu + soft-block L5a&lt;1 (+ hard-block LONG-only khi STRONG_BEARISH) khiến **longOk=0**; SHORT được CVD âm hỗ trợ |

### 9. “Bug” / lệch cần duyệt (chưa sửa)

Không phải comment-out LONG hay đảo dấu so sánh L1–L4. Các điểm **thiết kế / bất đối xứng** đáng duyệt:

| ID | File / vị trí | Mô tả | Mức |
|---|---|---|---|
| **B1** | `indicators.ts` `evaluateLongCvdHardBlock` (~1004–1017); `scorerV4.ts` `scoreL5aV4` | LONG hard-block khi CVD &lt; −20M + momentum xấu + dưới EMA20. Đếm 731 bars trên NEAR 180d. | Asymmetry có chủ đích |
| **B2** | `scorerV4.ts` ~500–523 + ~1204 | LONG L5a = 0 khi CVD “âm sâu” → soft-block bắt buộc. Với CVD tích lũy −40M…−120M, **LONG vĩnh viễn không `canEnter`** trong BT dài. | **Nguyên nhân trực tiếp longOk=0** |
| **B3** | `scorerV4.ts` ~483–493 vs B1 | SHORT hard CVD tại **+2M**; LONG không dùng `CVD_LONG_HARD_BLOCK (-2M)` — hằng số orphan trong `constants/scoring.ts` ~741 | Inconsistency constants |
| **B4** | `scripts/backtest-v4-near-90d.ts` `buildInput` CVD | CVD full-history trong BT dài khuếch đại B2 — có thể **artifact phương pháp BT** vs live | Cần làm rõ khi redesign |
| **B5** | Funding taxonomy L6 | Mild positive funding ưu SHORT (0.5 vs 1.5) | Phụ — không đủ gây 0 LONG |

**Không sửa trong nhiệm vụ này — chờ duyệt.**

### Đề xuất hướng xử lý (chỉ ý tưởng, chưa code)

1. **Rolling CVD window** trong backtest (và/hoặc live SSOT) — vd 7d/14d — trước khi đổi ngưỡng.  
2. Hoặc nới soft-block L5a LONG khi momentum recovering + L1/L3 mạnh (NEAR-only / flag).  
3. Audit lại `CVD_LONG_HARD_BLOCK: -2M` (dùng hoặc xóa comment).  
4. Sau mọi thay đổi: rerun 180d và bắt buộc có **n LONG &gt; 0** + IS/OOS trước khi tin WR.

### Checklist duyệt

| Hạng mục | Duyệt? |
|---|---|
| Chấp nhận kết luận (c) — không phải bug L3 LONG | ⬜ |
| Ưu tiên B2 (L5a soft + CVD tích lũy) | ⬜ |
| Ưu tiên B4 (rolling CVD trong BT) trước khi đổi threshold | ⬜ |
| Cho phép sửa code sau duyệt | ⬜ |

---

**Artifacts:**  
`docs/exports/near_v4_180d_long_zero_investigate.json` · `scripts/investigate-near-180d-long-zero.ts` · `near_backtest_180d_rerun_longcheck.csv` (xác nhận lại 0 LONG / 86 SHORT).
