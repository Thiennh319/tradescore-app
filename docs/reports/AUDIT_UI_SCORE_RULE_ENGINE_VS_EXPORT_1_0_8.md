# AUDIT — UI wiring Score/Rule Engine vs schema export v1.0.8

**Ngày:** 2026-08-08  
**Phạm vi:** UI đọc dữ liệu Score/Rule Engine (Decision badge, Trade Plan modal, Position Adviser, ESM UL Review, scorer detail).  
**Không sửa code** — báo cáo only.

---

## Verdict

UI **không đọc Markdown export schema**. Nó đọc **live scorer snapshot** (`DirectionalScoreV3/V4` → `SignalRowScorerSnapshot` trong `services/signalBoardScan.ts`). App stamp `engineVersion: 1.0.8` trên export; **không có file tên “Engine export schema v1.0.8”**. Export wire **đổi tên** một số field (`blockReasons` → `scoreBlocks` → count `softBlocks`; thêm `blockType`, `warningCount`) mà UI **không** dùng những tên đó.

Ngày sửa trong bảng = `git log -1 --format="%ai %h %s" -- <file>` (commit gần nhất). Một số file còn WIP uncommitted trên working tree.

---

## Schema / SSOT

| Layer | Role | Evidence |
|--------|------|----------|
| App / engine stamp | `BUILD_INFO.version = '1.0.8'` | `constants/buildInfo.ts` |
| Live Score Engine | `hardBlocks[]`, `groupBlocks[]`, `warnings[]`; V4 + `blockReasons[]` | `services/scorerV3.ts`, `services/scorerV4.ts` |
| UI scan SSOT | `hardBlocked`, `mandatoryViolations`, `groupBlocks`, `*HardBlocks`, `*BlockReasons`, `scoringWarnings`, `finalEntryStatus` | `services/signalBoardScan.ts` |
| ESM Rule boundary | `NormalizedRuleOutput`: `hardBlocks`, `groupBlocks`, `blockReasons` | `services/entryStateManager/normalizedRuleOutput.ts` |
| Export wire | Live → Markdown Trace/Review; `engineVersion: BUILD_INFO.version` | `services/exportTraceReviewWire.ts` |
| Named “schema export Engine v1.0.8” doc | **Không tìm thấy** dưới `docs/` | — |

### Mapping tên (Engine live ↔ Export wire ↔ UI)

| Tên | Live engine (1.0.8) | Export wire | UI |
|-----|---------------------|-------------|-----|
| `hardBlocks[]` | Có (`DirectionalScore*`) | Có | Có (qua snap / advisor) |
| `hardBlocked` | Derived trên snap | Có | Có (boolean phẳng) |
| `groupBlocks[]` | Có | Có (counts/list) | Có |
| `blockReasons[]` | V4 soft score-block | Map → `scoreBlocks` → `softBlocks` count | UI đọc `blockReasons` / `*BlockReasons` |
| `scoreBlocks` | Không phải field scorer | Wire-local alias | **UI không đọc** |
| `softBlocks` | Không trên scorer | Entry Review/Trace **count** | **UI không đọc** |
| `softBlocked` | — | — | **Không tồn tại codebase** |
| `warningCount` | — | Snapshot từ `scoringWarnings.length` | UI dùng arrays `warnings` / `scoringWarnings` |
| `blockType` | — | Rule Trace only (`HARD`/`SOFT`/…) | **UI không đọc** |
| `FinalEntryStatus` | Enum trên snap | Entry decision tree | Có |

Evidence export map:

```ts
// services/exportTraceReviewWire.ts (~360–374)
const scoreBlocks =
  snap.direction === 'LONG'
    ? snap.longBlockReasons ?? []
    : snap.shortBlockReasons ?? [];
// ...
engineVersion: BUILD_INFO.version, // '1.0.8'
```

Live V4:

```ts
// services/scorerV4.ts DirectionalScoreV4
hardBlocks: string[];
blockReasons: string[];  // soft — không phải hard
groupBlocks: string[];
warnings: string[];
```

---

## Bảng audit UI

| Component/File | Field đang đọc | Nguồn kiểu dữ liệu (interface/type) | Ngày sửa gần nhất | Còn khớp schema v1.0.8? |
|---|---|---|---|---|
| `components/dashboard/SignalBoard.tsx` | `snap.hardBlocked` (bool); `longHardBlocks`/`shortHardBlocks`; `mandatoryViolations`; `groupBlocks[]`; `groupScores`; layers; `decisionLabel`; `finalEntryStatus`; plan `blockReasons`; merged local `blockReasons` | `SignalRow` / `SignalRowScorerSnapshot` (`signalBoardScan.ts`); `FinalEntryStatus` (`types/scoring.ts`) | **2026-08-02** `f5cf251` feat(v1.0.8): merge NEAR S1/S3 + ambiguity + U1 | **Khớp live** (`hardBlocked`, hard/group lists). Không dùng `scoreBlocks`/`softBlocks`/`blockType` |
| `services/signalBoardScan.ts` *(SSOT feed UI)* | Map `active.hardBlocks`/`groupBlocks`/`blockReasons`/`warnings` → snap: `hardBlocked`, `*HardBlocks`, `*GroupBlocks`, `*BlockReasons`, `scoringWarnings`, `finalEntryStatus` | `DirectionalScoreV3/V4` → `SignalRowScorerSnapshot` | **2026-08-08** `a253036` fix(binance): rate-limit / V3V4-DATA | **Khớp live**; `*BlockReasons` = soft (export gọi `scoreBlocks`) |
| `services/tradePlanExplainer.ts` | `long/shortHardBlocks`, `mandatoryViolations`, `long/shortGroupBlocks`/`groupBlocks`, layers, `awaitingRescore` | `SignalRow` → `ExplainBlocksResult` | **2026-07-05** `e2f571c` feat(v1.0.5) | **Khớp live** |
| `components/dashboard/TradePlanModal.tsx` | `row.longScore`/`shortScore`; `blockInfo.blocks`/`suggestions` (từ explainer) | `SignalRow`; `ExplainBlocksResult` | **2026-07-05** `e2f571c` | **Khớp** (blocks derived từ hard/group) |
| `components/TradePlanV3View.tsx` | props `finalEntryStatus`, `hardBlockReasons`; plan `warnings`, `blockReasons`, `decision` | `FinalEntryStatus`; `TradePlanV3` (`constants/scoring`) | **2026-06-28** `c868ddb` initial snapshot | **Khớp live**; plan warnings ≠ export `warningCount` |
| `components/FinalEntryBadge.tsx` | `FinalEntryDisplay` (`status`, label, reasons upstream) | `services/finalEntryStatus.ts` | **2026-07-01** `f08ff28` | **Khớp** `FinalEntryStatus`. Trên SignalBoard đang **ẩn** (`{false &&}`) |
| `components/DecisionBadge.tsx` | `label: TradeDecisionLabel`, `display`, optional score | props local; `TradeDecisionLabel` | **2026-06-28** `c868ddb` | Decision labels tồn tại; **không có import production** (orphan) |
| `components/dashboard/TradeStorePanel.tsx` | `decisionLabel`, `decisionColor`, `winrate`, scores, `awaitingRescore` | `ScoringResultV3/V4` | **2026-06-28** `c868ddb` | **Khớp live**; **không thấy mount trong App hiện tại** |
| `components/dashboard/ScorerV4DetailSection.tsx` | `groupScores`, **`groupBlocks[]`**, `marketMode`, `decisionLabel`, `awaitingRescore` | `DirectionalScoreV4` / `ScoringResultV4` | **2026-06-28** `c868ddb` | **Khớp** `groupBlocks[]` |
| `components/dashboard/ScorerV3DetailSection.tsx` | cùng pattern V3: `groupScores`, **`groupBlocks[]`** | `DirectionalScoreV3` | **2026-06-28** `c868ddb` | **Khớp** |
| `components/GroupScoreBar.tsx` | `groupScores`, **`groupBlocks: string[]`** | `GroupScores` (`scorerV3/V4`) | **2026-06-28** `c868ddb` | **Khớp**; SignalBoard cũng **ẩn** bar (`{false &&}`) |
| `components/LayerCard.tsx` | `LayerResult[]`: `score`, `reason`, `isMandatoryViolation` | `constants/scoring.ts` LayerResult | **2026-08-02** `f5cf251` | **Khớp**; ≠ export `blockType` |
| `components/ScoreRing.tsx` | `score` / `maxScore` numeric | props | **2026-06-28** `c868ddb` | **Khớp** totals; **ẩn** trên SignalBoard |
| `components/OpenPositionPnl.tsx` | map scorer → advisor: **`hardBlocks[]`**, **`groupBlocks[]`**, `warnings`, `groupScores`, `decision`, layers | `OwnDirectionScore` (`positionAdvisorV3.ts`); `evaluatePositionV2/V4` | **2026-08-03** `4e5fcb3` backup emergency | **Khớp live arrays**; **không thấy import trong App/screens** hiện tại |
| `components/PositionRecommendation.tsx` | kết quả advisor: `type`, `urgency`, `confidence`, reasons — **không** raw hard/group lists | `PositionRecommendation` (`positionAdvisorV3.ts`) | **2026-07-05** `e2f571c` | Gián tiếp khớp; không đọc export `softBlocks` |
| `services/positionAdvisorV3.ts` / `V4.ts` | input `hardBlocks[]`, `groupBlocks[]`, `warnings` | advisor interfaces | **2026-07-05** `e2f571c` | **Khớp live** |
| `hooks/useJournalMarketSync.ts` | V41 `evaluatePositionV41` (không đọc `hardBlocks` V3/V4) | V41 adviser types | **2026-08-03** `4e5fcb3` | Ngoài Score Engine V3/V4 block schema |
| `utils/esmUlReviewDecision.ts` + `esmUlReviewExecutiveSummary.ts` | `scan.hardBlocked`, **`hardBlocks[]`**, **`groupBlocks[]`**, **`blockReasons[]`**, warnings / `finalEntryStatus` | `ProductionEsmScanContext` / `signalRowScanContext.ts` | **2026-08-03** `4e5fcb3` | **Khớp live**; không dùng `scoreBlocks`/`softBlocks` |
| `utils/esmUiDisplay.ts` | `ruleOutput.hardBlocks[]`, `groupBlocks[]` → badge READY/WATCH/BLOCKED/LOCKED | `NormalizedRuleOutput` | **2026-08-03** `4e5fcb3` | **Khớp** ESM rule arrays |
| `components/journal/UlReviewExplanationSheet.tsx` / `UlReviewExplanationContent.tsx` | panel UL đã build (recommendation, warningFactors…) — không đọc raw export schema | `EsmUlReviewExplanationPanel` | **2026-08-03** `4e5fcb3` | Upstream fields khớp live |
| `components/journal/EsmRecommendationCell.tsx` | `hintBadge` (RuleBook-ish) | `esmUiDisplay` | **2026-07-12** `2d01337` | ESM states; table thường pass `hintBadge={null}` |
| `components/dashboard/SignalBoardUnified.tsx` | `blockReasons` từ unified/EW — **không** Score Engine `hardBlocks`/`scoreBlocks` | local unified signal | **2026-07-05** `e2f571c` | N/A Score schema (khác nguồn) |
| `components/dashboard/TradePlanModalV41.tsx` / `SignalBoardV41.tsx` | V41 levels/plan; empty `mandatoryViolations` stub | V41 card models | **2026-07-05** `e2f571c` | Không map Score Engine blocks |

---

## Export fields UI không đọc (rename risk)

| Export field @ `engineVersion` 1.0.8 | UI / live tương đương |
|---|---|
| `scoreBlocks` | `blockReasons` / `longBlockReasons` / `shortBlockReasons` |
| `softBlocks` (count) | `blockReasons.length` (không có field `softBlocks` trên UI) |
| `softBlocked` | **Không tồn tại** trong codebase |
| `warningCount` | `scoringWarnings` / `warnings` arrays |
| `blockType` (`HARD`/`SOFT`/…) | Chỉ Rule Trace export — UI không đọc |

---

## Takeaways

1. UI SSOT = **`SignalRowScorerSnapshot` + `DirectionalScoreV4`**, không phải export Markdown.  
2. UI dùng **cả** boolean `hardBlocked` **và** list `hardBlocks` / `*HardBlocks` / `groupBlocks` / `blockReasons` — không chỉ một kiểu.  
3. Lệch tên lớn nhất với export 1.0.8: **`blockReasons` (UI/engine) ↔ `scoreBlocks` / `softBlocks` (export)**.  
4. Nhiều chrome Score (FinalEntryBadge, GroupScoreBar, ScoreRing, layers) vẫn **tính** trên SignalBoard nhưng **ẩn** `{false &&}`; `DecisionBadge` / `OpenPositionPnl` / `TradeStorePanel` gần như orphan khỏi App hiện tại.

---

## Task ID

**AUDIT-UI-SCORE-RULE-ENGINE-vs-EXPORT-1.0.8** · 2026-08-08 · report-only
