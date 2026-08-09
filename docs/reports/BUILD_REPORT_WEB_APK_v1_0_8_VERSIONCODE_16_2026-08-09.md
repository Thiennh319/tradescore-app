# BUILD REPORT — LINK/AVAX price decimals + Web/APK v1.0.8 (versionCode 16)

**Ngày:** 2026-08-09  
**Branch:** `backup/emergency-file-wipe-restore-20260803`  
**Commit/push:** **CHƯA** — chờ duyệt rồi mới commit

---

## Verdict

| Hạng mục | Kết quả |
|----------|---------|
| LINK/AVAX display | **3** thập phân |
| ETH display | **1** (giữ) |
| Tests `formatPrice` | **10/10 pass** |
| versionName | **1.0.8** |
| versionCode | **16** (15 → 16) |
| Web EXE | **SUCCESS** |
| APK | **SUCCESS** |
| aapt | `versionCode='16' versionName='1.0.8'` |

---

## 1) Thay đổi code (uncommitted)

### `utils/formatPrice.ts`
| Symbol | Trước | Sau |
|--------|-------|-----|
| LINKUSDT | 1 | **3** |
| AVAXUSDT | 1 | **3** |
| ETHUSDT | 1 | **1** (giữ) |

Comment cập nhật: `PRICE_DECIMALS` = **hiển thị UI**, khác tickSize sàn (LINK/AVAX Futures vẫn 0.10).

### Desktop + mobile
`SignalBoard.tsx` compact + card đều gọi `formatUsdPrice` → **một chỗ** (`PRICE_DECIMALS`) áp dụng cả hai.

### Scope phụ
`parsePriceInput` cũng dùng `priceDecimals` → làm tròn input journal theo 3 dp cho LINK/AVAX. **Không** đổi tickSize/scoring/engine đặt lệnh sàn.

### Test
`utils/formatPrice.test.ts` — assert LINK/AVAX 3 dp (`$8.312`, `$6.523`, …); ETH vẫn 1 dp.

---

## 2) Version bump (uncommitted)

| File | Field | Giá trị |
|------|-------|---------|
| `app.json` | `versionCode` | **16** |
| `android/app/build.gradle` | `versionCode` | **16** |
| versionName / package / buildInfo | | **1.0.8** |

---

## 3) Artifacts

| Artifact | Path | Build time |
|----------|------|------------|
| Web EXE | `dist/TradeScore-Web-v1.0.8/TradeScore-Web.exe` | 2026-08-09 22:26:43 |
| APK | `dist/TradeScore-v1.0.8.apk` | 2026-08-09 22:29:09 |

**aapt:**
```
package: name='com.tradescore.app' versionCode='16' versionName='1.0.8'
```

Logs:
- `docs/exports/_build_web_v1_0_8_vc16_2026-08-09.log`
- `docs/exports/_build_apk_v1_0_8_vc16_2026-08-09.log`

---

## 4) Đề xuất commit (khi bạn duyệt)

```
fix: show LINK/AVAX prices with 3 decimals (UI display)
chore(build): bump versionCode 15->16 for v1.0.8 rebuild (LINK/AVAX decimals)
```

Hoặc 1 commit gộp — theo bạn.
