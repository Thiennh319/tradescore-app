# Task V3V4-DATA-2a — 429/418 Handling

**Ngày:** 2026-08-08  
**Phạm vi:** Xử lý HTTP 429 (rate-limit) / 418 (IP ban) + pause polling toàn app  
**Tiền đề:** V3V4-DATA-1 (IP đang 418; app trước đó không phân biệt / không dừng poll)

---

## Trạng thái

**DONE** — gate toàn cục + pause/resume polling + V41 raw fetch tôn trọng gate + tests PASS.

---

## Đã sửa

### `services/binanceApi.ts`
- Gate toàn cục: `rate_limit` | `ip_ban`, `untilMs`, listeners.
- **429:** đọc `Retry-After` (`parseRetryAfterMs`); fallback `BINANCE_RATE_LIMIT_DEFAULT_MS` (5s); activate backoff; request sau **không** gọi mạng (`assertBinanceTrafficAllowed`).
- **418:** đọc `banned until <epoch>` từ body nếu có; `untilMs = max(now + BINANCE_IP_BAN_MIN_MS (10m), body)`; log rõ; chặn mọi traffic.
- `binanceGet` / `fetchForceOrders` / OI path: assert + `applyBinanceHttpFailure` trên non-OK.
- Export: `binancePublicFetch`, `isBinanceTrafficBlocked`, `subscribeBinanceBlockState`, `msUntilBinanceTrafficAllowed`, `BinanceTrafficBlockedError`, test helpers.

### `services/v41/rawMarketFetcher.ts`
- `fetchFundingRateV41` và `fetchFormingFourHCloseV41` dùng `binancePublicFetch` (không còn `fetch` thẳng) → cùng throttle / 429-418 gate.

### `hooks/useResumeableBinanceInterval.ts` (mới)
- Interval **clear** khi gate active; `setTimeout` tới `untilMs` rồi resume + tick.

### Polling hooks chuyển sang resumable interval
| Hook | Interval |
|------|----------|
| `useUnifiedAppScan` | 60s (+ early return nếu blocked) |
| `useMarketAnalysis` | price + market 60s |
| `useLockedPlanMonitor` | 30s (enabled khi có WAITING plan) |
| `useWhaleRadar` | 5 phút |
| `usePendingOrderFill` | 60s (cùng gate — tránh ticker khi ban) |

---

## Test

```text
npx vitest run services/binanceApi.test.ts hooks/useResumeableBinanceInterval.test.tsx
→ 2 files / 21 tests PASS
```

Phủ:
- 429 + `Retry-After` → backoff đúng; lần 2 không gọi `fetch`
- 429 không header → default 5s
- 418 → `ip_ban` ≥ 10 phút (floor); body `banned until` xa hơn thì dùng body
- Hết hạn → resume fetch OK
- Hook: dừng tick khi ban, resume sau hết hạn; mount khi đã block không tick ngay

---

## Việc còn lại

- (Tuỳ chọn) UI banner “Binance tạm dừng / IP ban đến …”
- (Tuỳ chọn) Task DATA-1 follow-up: gộp request / giảm depth weight (chưa làm ở 2a)
- Unban thực tế: đợi hết ban hoặc đổi IP/network — gate chỉ **không kéo dài** ban bằng spam

---

## Rủi ro

1. **`binanceGet` fail → fallback cache**: vẫn set gate 429/418 trước khi serve cache — đúng. Nếu không cache, UI/error row như cũ.
2. **Floor 10 phút 418:** nếu Binance ban ngắn hơn body missing → pause có thể dài hơn ban thật; an toàn hơn spam lại sớm.
3. **`activateBlock` giữ deadline muộn hơn:** 429 ngắn sau 418 dài không rút ngắn ban.
4. Locked plan effect deps đơn giản hơn trước — tick luôn đọc `options` mới qua `tickRef`; cần smoke tay khi có plan WAITING.
5. IP **đang** 418 ngoài app: sau deploy vẫn fail đến hết ban; app sẽ pause poll thay vì fire liên tục.

---

## Task ID

**V3V4-DATA-2a** (429/418 Handling).
