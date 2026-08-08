# Task V3V4-DATA-BUILD — Rebuild APK + Web (giữ 1.0.8)

**Ngày:** 2026-08-08  
**Version product:** **1.0.8** (không bump)  
**HEAD build:** `a253036` — DATA 2a→2e  
**Parent ship:** `12144a1` — V4-EXPORT-1 (đã trong ancestry)  
**Phạm vi:** APK + Web EXE

---

## Trạng thái

**DONE** — Đã xác nhận phạm vi nền tảng dùng chung → commit DATA → test gate → `prebuild:android` + `build:apk` + `build:web` → marker verify OK.

---

## 1. Phạm vi ảnh hưởng APK vs Web (điểm yêu cầu 1)

Các module rate-limit / shared pipeline là **TS services + hooks dùng chung Metro bundler** cho Android và Web. Không có `Platform.OS` gating trong logic Binance của chúng.

| File | `Platform.OS`? | Kết luận |
|------|----------------|----------|
| `services/binanceApi.ts` | **Không** | Gate 429/418 + concurrency queue — shared |
| `services/v41/scanV41.ts` | **Không** | `fetchSharedBtcMarketV41` once/cycle — shared |
| `services/signalBoardScan.ts` | **Không** | `publishScanMarketSnapshot` — shared |
| `services/v41/rawMarketFetcher.ts` | **Không** | BTC inject / `binancePublicFetch` — shared |
| `hooks/useMarketAnalysis.ts` | **Không** | Snapshot prefer — shared |
| `hooks/useLockedPlanMonitor.ts` | **Không** | Ticker-only refresh — shared |
| `hooks/useResumeableBinanceInterval.ts` | **Không** | Pause/resume theo gate — shared |
| `services/scanMarketSnapshotStore.ts` | **Không** | Shared store |
| `services/bookTickerFromMarket.ts` | **Không** | Derive book từ depth snapshot |
| `services/lockedPlanMonitorService.ts` | **Không** | Snapshot + ticker-only path |
| `hooks/useWhaleRadar.ts` | **Có — chỉ AppState** | Poll vẫn dùng `useResumeableBinanceInterval` trên **cả hai**; `Platform.OS === 'web'` chỉ **tắt** `AppState.addEventListener` (resume khi app foreground — native only) |

Trích `useWhaleRadar.ts` (phần platform-specific duy nhất trong danh sách):

```79:85:hooks/useWhaleRadar.ts
  useEffect(() => {
    const appStateSub =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') void scan(false);
          });
```

→ **Sửa 2a→2e áp dụng cả APK và Web.** Build cả hai là đúng.

---

## 2. Version build

| Nguồn | Giá trị |
|-------|---------|
| `package.json` | **1.0.8** |
| `app.json` expo.version | **1.0.8** |
| `android/.../versionName` (sau prebuild) | **1.0.8** / versionCode **12** |
| `constants/buildInfo.ts` | **1.0.8** |
| Web banner / BUILD_INFO | **v1.0.8** |

**Không bump version.**

---

## 3. Commit trước build

| Commit | Nội dung |
|--------|----------|
| `a253036` | DATA 2a→2e source + reports (+ hooks wiring Unified/Pending) |
| `12144a1` | V4-EXPORT-1 `context.coin` / `pickFrozenRow` |

Working tree vẫn dirty **ngoài phạm vi** (docs wipe, journal UI, web artifact cũ, …) — **không** đưa vào commit build.

---

## 4. Test trước build

### 4a. DATA + sync (gate ship)

| Batch | Kết quả |
|-------|---------|
| `binanceApi` + `useResumeableBinanceInterval` + `rawMarketFetcher.btcDedup` + `scanV41` + `scanMarketSharedPipeline` | **5 files / 38 PASS** |
| `driveSync*` + `exportAuditCoin` | **8 files / 45 PASS** |

### 4b. `exportTraceReviewWire*` — 25 fail = **known pre-existing** (không regression)

Xác minh chi tiết: `docs/exports/REPORT_V3V4_DATA_BUILD_FAIL_VERIFY_PREEXISTING_2026-08-08.md`

Tóm tắt bằng chứng:

1. Baseline VERIFY **2026-08-07 10:01** (trước V4-EXPORT-1 **19:08**) đã liệt kê **đúng 25** test case này (`_verify_baseline_fail_tests.txt`).
2. So HEAD vs baseline: **both=25, onlyHead=0, onlyBaseline=0**.
3. Worktree `471384b` vs `12144a1`: cùng **25 failed | 12 passed** trên 6 file; diff titles **0**.
4. Báo cáo V4-EXPORT-1-BUILD chỉ chạy subset **5 file / 37 PASS** — không bao gồm `l5aBlockTypeSoft` / `task188` / `positionAdviserWire` / …
5. Assertion điển hình (`HARD` vs `SOFT`) **không** liên quan `pickFrozenRow`/`context.coin`.

→ **Không block build.** Ghi rõ: đây là **known pre-existing issue**, không thuộc fix DATA / V4-EXPORT-1 đã ship.

---

## 5. Đường dẫn output

| Artifact | Path |
|----------|------|
| **APK** | `dist/TradeScore-v1.0.8.apk` (~69.3 MB, 2026-08-08 09:34) |
| APK BUILD_INFO | `dist/BUILD_INFO_APK_v1.0.8.txt` |
| **Web EXE** | `dist/TradeScore-Web-v1.0.8/TradeScore-Web.exe` |
| Web bundle | `dist/TradeScore-Web-v1.0.8/TradeScore-web-v1/` (`index-985ad7da….js`) |
| Web BUILD_INFO | `dist/TradeScore-Web-v1.0.8/BUILD_INFO.txt` |

Lưu ý build: `prebuild --clean` xoá `android/local.properties` → đã tạo lại  
`sdk.dir=C:\\Users\\Thien\\AppData\\Local\\Android\\Sdk` (như các lần ship trước).

---

## 6. Xác nhận build chứa đúng fix

**Ship commits:** `a253036` (+ ancestry `12144a1`).

### Web bundle (`index-985ad7da5872198368db605c7cafce20.js`)

| Marker | Hit |
|--------|-----|
| `BINANCE_MAX_CONCURRENT` | YES |
| `withBinanceConcurrency` | YES |
| `isBinanceTrafficBlocked` | YES |
| `fetchSharedBtcMarketV41` | YES |
| `publishScanMarketSnapshot` | YES |
| `msUntilBinanceTrafficAllowed` / `subscribeBinanceBlockState` | YES |
| `exportTraceOrReviewMarkdown=function(e,o` + `scorerVersion,o.coin` | YES (V4-EXPORT-1) |

### APK Hermes (`assets/index.android.bundle` trong APK + generated)

| Marker | Hit |
|--------|-----|
| `BINANCE_MAX_CONCURRENT` | YES |
| `withBinanceConcurrency` | YES |
| `isBinanceTrafficBlocked` / `BinanceTrafficBlockedError` | YES |
| `fetchSharedBtcMarketV41` | YES |
| `publishScanMarketSnapshot` | YES |
| `bookTickerFromMarketDepth` | YES |
| `msUntilBinanceTrafficAllowed` | YES |
| `exportTraceOrReviewMarkdown` / `pickFrozenRow` | YES (V4-EXPORT-1) |

---

## 7. Việc còn lại

1. **Live smoke Binance:** IP hiện có thể vẫn **418** — đợi hết ban hoặc đổi mạng/VPN rồi mới verify gate pause/resume thật.
2. **Task riêng (sau):** điều tra/sửa **25 fail pre-existing** `exportTraceReviewWire.l5a*` / `task188*` / `positionAdviserWire*` / … — **không** làm trong task build này.
3. Working tree dirty ngoài `a253036` — dọn/commit riêng nếu cần.
4. (Tuỳ chọn) Dedup `loadQuotes` UI với giá scan (đã đánh giá ở 2e).

---

## 8. Rủi ro

- IP 418 vẫn ban → app gate sẽ pause polling (đúng thiết kế) nhưng **không** chứng minh giảm rate trên mạng đang ban.
- APK cập nhật in-place ưu tiên hơn uninstall (giữ AsyncStorage) — theo thói quen ship trước.
- Hermes minify: một số chuỗi log dài có thể bị cắt; marker export-name ở trên đã đủ xác nhận có code mới.

---

## Task ID

**V3V4-DATA-BUILD**
