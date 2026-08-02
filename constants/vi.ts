import type {
  AnalysisTimeframe,
  AppTradeSymbol,
  FundingOIRegime,
  LayerName,
  MarketRegime,
  MarketTrend,
  StructureType,
  Timeframe,
} from './scoring';
import type { CVDDivergenceType } from '../services/indicators';
import type { ScoreBias } from '../services/scorer';
import type { TradingBias } from '../utils/tradingBias';

export const vi = {
  app: {
    footer: (layers: number) =>
      `TradeCoin v1.0.8 · AI Scorer · Backtest · ${layers} lớp tín hiệu`,
    errorTitle: 'Đã xảy ra lỗi',
    loadingPersistTitle: 'Đang tải dữ liệu đã lưu…',
    loadingPersistHint:
      'Lịch sử lệnh, lệnh đang chạy, lệnh chờ và bảng tín hiệu sẽ hiện lại sau khi nạp xong.',
    persistRestored: (open: number, pending: number, closed: number) =>
      `Đã khôi phục · ${open} đang chạy · ${pending} chờ · ${closed} đã đóng`,
  },
  clock: {
    vnLabel: 'Giờ VN',
    inSession: 'Trong phiên',
    offSession: 'Ngoài phiên',
    nextScan: 'Quét kế tiếp',
    notifyOn: 'Thông báo :02',
    notifyOff: 'Tắt TB',
    notifyDenied: 'Quyền thông báo bị tắt — bật trong Cài đặt hệ thống / trình duyệt',
    notifyHint: 'Quét mỗi phút (notification cố định) · thông báo phiên :02 + SL/TP',
    notifyTest: 'Test TB',
    notifyTestOk: 'Đã gửi — xem bảng thông báo OS',
    notifyTestFail: 'Không gửi được — bật quyền trước',
  },
  notify: {
    title: (time: string) => `TradeScore · Phiên quét ${time}`,
    testTitle: (time: string) => `TradeScore · Thử TB ${time}`,
    noSetup: 'Không có setup mới',
    openTrades: (n: number) => `${n} lệnh đang chạy`,
    noOpenTrades: 'Không có lệnh OPEN',
    action: 'Mở app kiểm tra tín hiệu',
  },
  whaleRadar: {
    notifyTitle: 'Radar Cá Mập',
    sideBuy: 'MUA',
    sideSell: 'BÁN',
    placed: (coin: string, side: string, price: string) =>
      `Cá mập đang đặt tường lớn ${side} ở ${coin} ở giá ${price}`,
    pulled: (coin: string, side: string, price: string) =>
      `Cá mập gỡ tường lớn ${side} ở ${coin} ở giá ${price}`,
  },
  priceAlert: {
    title: (coin: string, dir: string, level: string) =>
      `TradeScore · ${coin} ${dir} · ${level}`,
    body: (mark: string, target: string) =>
      `Giá hiện tại ${mark} · Mức ${target}. Mở app kiểm tra tín hiệu`,
    levelLabel: (kind: 'SL' | 'TP1' | 'TP2' | 'TP3') => {
      if (kind === 'SL') return 'Chạm cắt lỗ (SL)';
      return `Chạm chốt lời ${kind}`;
    },
  },
  layerCard: {
    title: 'Chi tiết 11 lớp chấm điểm',
    empty: 'Chưa có dữ liệu chấm điểm.',
    l6ExpandTitle: 'L6 — Funding Rate + Momentum',
    l6FallbackBadge: 'Dữ liệu cơ bản',
    l6Current: 'Funding hiện tại',
    l6Avg8: 'Trung bình 8 chu kỳ',
    l6Velocity: 'Velocity',
    l6State: 'Trạng thái',
    l6Scores: (long: string, short: string) => `Điểm LONG: ${long}đ | SHORT: ${short}đ`,
  },
  activePosition: {
    sectionTitle: 'Lệnh đang chạy',
    sectionHint: 'Khuyến nghị Giữ / Cắt / Chốt sớm — cập nhật mỗi phiên :02',
    long: 'LONG',
    short: 'SHORT',
    entry: 'Giá vào',
    current: 'Giá hiện tại',
    pnl: 'PnL tạm tính',
    close: 'Đóng',
    advise: 'Khuyến nghị',
    actionHold: 'Tiếp tục giữ',
    actionCut: 'Hủy lệnh',
    actionTp: 'Chốt lời',
    actionPending: 'Chờ đánh giá',
    pending: 'Chưa đánh giá — chờ phiên quét :02 hoặc bấm phân tích nhanh.',
    confidence: (pct: string) => `Độ tin cậy chỉ báo: ${pct}%`,
    evaluatedAt: (time: string) => `Đánh giá lúc ${time}`,
    stopOrder: 'Stop lệnh',
    stopConfirm: 'Chốt lệnh tại giá Mark hiện tại?',
    stopConfirmBtn: 'Xác nhận stop',
    stopCancel: 'Huỷ',
    stopLoss: 'SL',
    takeProfit: (n: number) => `TP${n}`,
    levelsTitle: 'Mức SL / TP',
    editLevels: 'Sửa SL/TP',
    saveLevels: 'Lưu SL/TP',
  },
  optimize: {
    apply: 'Áp dụng gợi ý',
    applyEntry: 'Áp dụng entry',
    applyLevels: 'Áp dụng SL/TP',
    edit: 'Sửa thủ công',
    pendingDetail: (current: string, suggested: string, pct: string) =>
      `Entry hiện tại ${current} → gợi ý ${suggested} (tốt hơn ${pct})`,
    openDetail: (parts: string) => parts,
  },
  tradeHistory: {
    title: 'Lịch sử giao dịch',
    subtitle: 'Tổng hợp các lệnh đã đóng · PnL thực tế',
    empty: 'Chưa có lệnh đóng — stop lệnh trên bảng tín hiệu để ghi nhận',
    total: 'Tổng lệnh',
    wins: 'Thắng',
    losses: 'Thua',
    winRate: 'Tỷ lệ thắng',
    totalPnl: 'PnL tổng',
    colCoin: 'Cặp',
    colEntry: 'Vào',
    colExit: 'Ra',
    colPnl: 'PnL',
    colReason: 'Lý do',
    colTime: 'Thời gian',
    closeReason: {
      MANUAL_STOP: 'Stop thủ công',
      SL: 'Chạm SL',
      TP1: 'Chạm TP1',
      TP2: 'Chạm TP2',
      TP3: 'Chạm TP3',
      OTHER: 'Khác',
    },
    clearAll: 'Xóa lịch sử đã đóng',
    clearConfirm: (n: number) =>
      `Xóa ${n} lệnh đã đóng? Lệnh đang chạy và lệnh chờ vẫn giữ nguyên.`,
    clearConfirmBtn: 'Xóa hết',
    clearCancel: 'Huỷ',
    pageLabel: (page: number, total: number) => `Trang ${page} / ${total}`,
    prevPage: 'Trước',
    nextPage: 'Sau',
  },
  journal: {
    title: 'Trade Journal',
    versionLabel: 'TradeCoin v1.0.8',
    subtitle: (count: number) => `${count} lệnh · V3 · V4 · CVDX`,
    empty:
      'Chưa có lệnh. Từ Trade Plan bấm ✅ XÁC NHẬN VÀO LỆNH hoặc ⏳ ĐẶT LỆNH CHỜ để lưu snapshot.',
    releaseTitle: 'v1.0.8',
    releaseNotes: [
      'NEAR SHORT: S1 L3≥1.5 + S3 nhãn tín hiệu mạnh',
      'Ambiguity 2.5 (4 coin) + Signal Board 1 nút active',
      'UL Analytics + Performance HT dashboard',
      'Trading Coach + Portfolio Advisor',
      'Trace Export (5 engine traces)',
      'AI Review Export (5 báo cáo tự chứa)',
      'Journal / Statistics / Dashboard Intelligence',
      'Fix VWAP entry direction validation',
    ],
    colSource: 'Source',
    colCoin: 'Coin',
    colStatus: 'Status',
    colRecommendation: 'Khuyến nghị',
    colEntry: 'Entry',
    colCurrentExit: 'Current/Exit',
    colPnl: 'PnL',
    colOpenReason: 'Open Reason',
    colCloseReason: 'Close Reason',
    colAction: 'Action',
    colTime: 'Time',
    activeTradesTitle: 'Lệnh đang chạy',
    activeTradesSubtitle: (count: number) => `${count} lệnh · giá & khuyến nghị live`,
    activeTradesEmpty: 'Không có lệnh đang chạy hoặc chờ khớp.',
    prevPage: '< Trước',
    nextPage: 'Sau >',
    pageLabel: (page: number, total: number) => `Trang ${page} / ${total}`,
    pnlRealizedLine: (pnl: string, pct: number) => `Realized: ${pnl} (${pct}%)`,
    pnlUnrealizedLine: (pnl: string, pct: number) => `Unrealized: ${pnl} (${pct}%)`,
    pnlTotalLine: (pnl: string) => `Tổng: ${pnl}`,
    partialStatsCount: (count: number) => `Đã chốt một phần: ${count} lệnh`,
    partialStatsRealized: (pnl: string) => `Tổng realized từ chốt một phần: ${pnl}`,
  },
  psychology: {
    open: 'Phân tích nhanh',
    title: 'Checklist tâm lý trước khi vào lệnh',
    subtitle: 'Xác nhận trạng thái kỷ luật trước khi quét tín hiệu mới.',
    warn: 'Hoàn tất tất cả mục để tiếp tục quét.',
    cancel: 'Huỷ',
    confirm: 'Xác nhận & quét',
  },
  /** Task 15.8.1 — Trading Coach UI labels (display only). */
  tradingCoach: {
    title: 'HLV Giao Dịch',
    sections: {
      summary: 'Tổng quan',
      overallStatus: 'Trạng thái tổng thể',
      coachScore: 'Điểm HLV',
      grade: 'Xếp hạng',
      dailyFocus: 'Trọng tâm hôm nay',
      topPriorities: 'Ưu tiên hàng đầu',
      actionPlan: 'Kế hoạch cải thiện',
      coachMessages: 'Nhận định của HLV',
      weeklyGoals: 'Mục tiêu tuần',
      nextSessionChecklist: 'Checklist trước giao dịch',
      confidence: 'Độ tin cậy',
      evidence: 'Cơ sở đánh giá',
    },
    status: {
      Excellent: 'Xuất sắc',
      Healthy: 'Ổn định',
      Improving: 'Đang cải thiện',
      Neutral: 'Trung lập',
      Warning: 'Cảnh báo',
      Critical: 'Nguy cấp',
    },
    priority: {
      CRITICAL: 'Khẩn cấp',
      HIGH: 'Cao',
      MEDIUM: 'Trung bình',
      LOW: 'Thấp',
      INFO: 'Thông tin',
    },
    checklist: {
      'EMA Alignment': 'EMA đồng thuận',
      'Trend Confirmed': 'Xu hướng xác nhận',
      'Trend aligned': 'Xu hướng xác nhận',
      'Volume Confirmed': 'Khối lượng xác nhận',
      'Volume confirmed': 'Khối lượng xác nhận',
      'CVD Confirmed': 'CVD xác nhận',
      'OI Confirmed': 'OI xác nhận',
      'Funding Safe': 'Funding an toàn',
      'Funding acceptable': 'Funding an toàn',
      'Whale Safe': 'Whale an toàn',
      'Whale safe': 'Whale an toàn',
      'RuleBook READY': 'RuleBook READY',
      'RR >= 2': 'RR ≥ 2',
      'RR >=2': 'RR ≥ 2',
      'Execution Ready': 'Sẵn sàng thực hiện lệnh',
    },
    /** Exact English phrase → Vietnamese (UI display). */
    phrases: {
      'Protect Capital': 'Bảo vệ vốn',
      'Improve RR': 'Cải thiện RR',
      'Trade BTC only': 'Ưu tiên giao dịch BTC',
      'Follow checklist before entry': 'Tuân thủ checklist trước khi vào lệnh',
      'Reduce position size.': 'Nên giảm khối lượng giao dịch.',
      'Reduce position size': 'Giảm khối lượng giao dịch',
      'Avoid low RR entries.': 'Tránh vào lệnh khi RR thấp.',
      'Avoid low RR entries': 'Tránh vào lệnh khi RR thấp',
      'Trade only during your best session hours.':
        'Chỉ giao dịch trong khung giờ hiệu quả nhất.',
      'Stop trading after 2 consecutive losses.':
        'Dừng giao dịch sau 2 lệnh thua liên tiếp.',
      'Do not enter until checklist clears.':
        'Không vào lệnh khi checklist chưa đạt.',
      'Wait for volume, whale, and RR confirmation.':
        'Chờ xác nhận khối lượng, whale và RR.',
      'Trade only the strongest strategy today.':
        'Chỉ dùng chiến lược mạnh nhất hôm nay.',
      'Size within plan on the leading strategy only.':
        'Chỉ phân bổ khối lượng theo chiến lược dẫn đầu.',
      'Protect capital — cut size until risk cools.':
        'Bảo vệ vốn — giảm khối lượng đến khi rủi ro hạ nhiệt.',
      'Reduce Position Size': 'Giảm khối lượng giao dịch',
      'Avoid trading after 22:00 UTC': 'Không giao dịch sau 22:00 UTC',
      'Increase minimum RR': 'Tăng tiêu chuẩn RR tối thiểu',
      'Improve trading discipline': 'Nâng cao kỷ luật giao dịch',
      'Reduce revenge trading': 'Hạn chế giao dịch trả thù',
      'Wait for confirmation': 'Chờ tín hiệu xác nhận',
      'Wait for confirmation.': 'Hãy chờ tín hiệu xác nhận trước khi vào lệnh.',
      'Trade only high quality setups':
        'Chỉ giao dịch khi tín hiệu đạt chất lượng cao',
      'Trade only high quality setups.':
        'Chỉ giao dịch khi tín hiệu đạt chất lượng cao.',
      'Performance is improving.': 'Hiệu suất giao dịch đang cải thiện.',
      'Focus on BTC setups.': 'Ưu tiên các thiết lập giao dịch BTC.',
      'Avoid opening positions after 22:00 UTC.':
        'Không nên mở vị thế sau 22:00 UTC.',
      'RR below minimum.': 'Tỷ lệ RR chưa đạt yêu cầu.',
      'Trading psychology is unstable.': 'Tâm lý giao dịch chưa ổn định.',
      'Excellent consistency.': 'Độ ổn định giao dịch rất tốt.',
      'High drawdown detected.': 'Phát hiện mức sụt giảm vốn cao.',
      'Enforce minimum RR': 'Áp dụng RR tối thiểu',
      'No coaching inputs.': 'Chưa có dữ liệu huấn luyện.',
      'Coach evaluation failed safely.': 'Không thể tạo báo cáo HLV.',
      'Entry quality blocked — avoid new entries':
        'Chất lượng vào lệnh bị chặn — tránh mở lệnh mới',
      'Entry quality incomplete — wait':
        'Chất lượng vào lệnh chưa đủ — hãy chờ',
    },
  },
  /** Task 15.8.2 — UL Analytics UI labels (display only). */
  ulAnalytics: {
    kpi: {
      winRate: 'Tỷ lệ thắng',
      profitFactor: 'Hệ số lợi nhuận',
      expectancy: 'Kỳ vọng lợi nhuận',
      averageRr: 'RR trung bình',
      avgRrShort: 'RR TB',
      netProfit: 'Lợi nhuận ròng',
      netPnl: 'Lợi nhuận ròng',
      largestWin: 'Lệnh thắng lớn nhất',
      largestLoss: 'Lệnh thua lớn nhất',
      averageWinner: 'Lãi trung bình',
      averageLoser: 'Lỗ trung bình',
      drawdown: 'Sụt giảm vốn',
      maxDrawdown: 'Sụt giảm vốn lớn nhất',
      currentDrawdown: 'Sụt giảm hiện tại',
      recoveryFactor: 'Hệ số phục hồi',
      calmarRatio: 'Tỷ lệ Calmar',
      consistency: 'Độ ổn định',
      stability: 'Độ bền chiến lược',
      stabilityScore: 'Độ bền chiến lược',
      performanceScore: 'Điểm hiệu suất',
      largestLossStreak: 'Chuỗi thua dài nhất',
      drawdownMax: 'Sụt giảm vốn lớn nhất',
    },
    chart: {
      equityCurve: 'Đường cong vốn',
      dailyPnl: 'Lợi nhuận theo ngày',
      performance: 'Hiệu suất',
      risk: 'Rủi ro',
      riskMetrics: 'Chỉ số rủi ro',
      strategy: 'Chiến lược',
      performanceByCoin: 'Hiệu suất theo Coin',
      performanceByDay: 'Hiệu suất theo ngày',
      resultDistribution: 'Phân bố kết quả',
      riskLevel: 'Mức rủi ro',
      highlightedInsights: 'Nhận định nổi bật',
    },
    coin: {
      coin: 'Đồng coin',
      trades: 'Số lệnh',
      winRate: 'Tỷ lệ thắng',
      pnl: 'Lợi nhuận',
      averageRr: 'RR TB',
      expectancy: 'Kỳ vọng',
      score: 'Điểm',
      rank: 'Xếp hạng',
      bestCoin: 'Coin tốt nhất',
      worstCoin: 'Coin kém nhất',
      bestWorstCoin: 'Coin tốt / kém nhất',
    },
    strategy: {
      strategy: 'Chiến lược',
      confidence: 'Độ tin cậy',
      lifecycle: 'Vòng đời',
      Excellent: 'Xuất sắc',
      Healthy: 'Ổn định',
      Growing: 'Đang phát triển',
      Stable: 'Ổn định',
      Declining: 'Suy giảm',
      Deprecated: 'Không còn hiệu quả',
      Disabled: 'Đã vô hiệu',
      Watch: 'Theo dõi',
      Weak: 'Yếu',
    },
    psychology: {
      psychology: 'Tâm lý giao dịch',
      Discipline: 'Kỷ luật',
      Patience: 'Kiên nhẫn',
      Execution: 'Thực thi',
      Confidence: 'Tự tin',
      'Emotional Control': 'Kiểm soát cảm xúc',
      'Risk Control': 'Kiểm soát rủi ro',
      Consistency: 'Độ ổn định',
      Habits: 'Thói quen',
      Warnings: 'Cảnh báo',
      Strengths: 'Điểm mạnh',
      Weaknesses: 'Điểm yếu',
    },
    insight: {
      tradingInsights: 'Phân tích giao dịch',
      insight: 'Nhận định',
      opportunities: 'Cơ hội',
      recommendation: 'Khuyến nghị',
      recommendations: 'Khuyến nghị',
      evidence: 'Cơ sở đánh giá',
      reason: 'Lý do',
      category: 'Danh mục',
      severity: 'Mức độ',
      bestPerformer: 'Hiệu suất tốt nhất',
      winningStreak: 'Chuỗi thắng',
      maxDrawdown: 'Sụt giảm vốn lớn nhất',
      profitFactor: 'Hệ số lợi nhuận',
      tradingIntelligence: 'Phân tích giao dịch',
      tradingIntelligenceStats: 'PHÂN TÍCH GIAO DỊCH · THỐNG KÊ',
      tradingIntelligenceDash: 'PHÂN TÍCH GIAO DỊCH · BẢNG ĐIỀU KHIỂN',
      tradingIntelligenceJournal: 'PHÂN TÍCH GIAO DỊCH · NHẬT KÝ',
    },
    entry: {
      entryQuality: 'Chất lượng điểm vào',
      score: 'Điểm đánh giá',
      decision: 'Quyết định',
      ENTER: 'VÀO LỆNH',
      WAIT: 'CHỜ',
      AVOID: 'KHÔNG VÀO',
      passedChecks: 'Điều kiện đạt',
      failedChecks: 'Điều kiện chưa đạt',
      blockedReasons: 'Lý do bị chặn',
      strengths: 'Điểm mạnh',
      weaknesses: 'Điểm yếu',
    },
    risk: {
      LOW: 'THẤP',
      MEDIUM: 'TRUNG BÌNH',
      HIGH: 'CAO',
      CRITICAL: 'NGUY CẤP',
      Low: 'THẤP',
      Medium: 'TRUNG BÌNH',
      High: 'CAO',
      Critical: 'NGUY CẤP',
      Unknown: 'Chưa xác định',
    },
    buttons: {
      refresh: 'Làm mới',
      compare: 'So sánh',
      export: 'Xuất báo cáo',
      filter: 'Lọc',
      details: 'Chi tiết',
      back: 'Quay lại',
      shareReport: 'Chia sẻ báo cáo',
      viewDetails: 'Xem chi tiết →',
    },
    stats: {
      overview: '1. Tổng quan',
      profit: '2. Lợi nhuận',
      drawdown: '3. Sụt giảm vốn',
      coin: '4. Đồng coin',
      strategy: '5. Chiến lược',
      trigger: '6. Trigger',
      confidence: '7. Độ tin cậy',
      advisor: '8. Advisor',
      tags: '9. Tags',
      day: '10. Ngày',
      week: 'Tuần',
      month: 'Tháng',
      sessionZone: 'Phiên giao dịch',
      total: 'Tổng lệnh',
      winrate: 'Tỷ lệ thắng',
      netPnl: 'Lợi nhuận ròng',
      avgHold: 'Thời gian giữ TB',
      currentDd: 'Sụt giảm hiện tại',
      maxDd: 'Sụt giảm lớn nhất',
      recovery: 'Hệ số phục hồi',
      empty: '(trống)',
      tagCombos: 'Tổ hợp tag',
    },
    dash: {
      tradingSummary: '1. Tổng quan giao dịch',
      gradeScore: 'Xếp hạng / Điểm',
      systemHealth: 'Sức khỏe hệ thống',
      status: 'Trạng thái',
      generated: 'Thời điểm tạo',
      todayLeading: '2. Hôm nay / Dẫn đầu',
      tradesWr: 'Số lệnh / Tỷ lệ thắng',
      topPicks: '4. Lựa chọn hàng đầu',
      riskMonitor: '5. Giám sát rủi ro',
      recommendations: '6. Khuyến nghị',
      recentTrend: '7. Xu hướng gần đây',
      activeInsights: '8. Nhận định đang hoạt động',
      quickStatistics: '9. Thống kê nhanh',
      quickFilters: '10. Bộ lọc nhanh',
      filterToday: 'Hôm nay',
      filterWeek: 'Tuần',
      filterMonth: 'Tháng',
      filterAll: 'Tất cả',
    },
    journal: {
      closedSample: 'Mẫu đã đóng',
      expectancy: 'Kỳ vọng lợi nhuận',
      avgHold: 'Thời gian giữ TB',
      hint: 'Mở chi tiết lệnh → Tóm tắt lệnh · Snapshot · Timeline · Replay · Cơ sở đánh giá · Tóm tắt AI.',
      tradeSummary: '1. Tóm tắt lệnh',
      decisionSnapshot: '2. Snapshot quyết định',
      marketSnapshot: '3. Snapshot thị trường',
      advisorTimeline: '4. Timeline Advisor',
      eventReplay: '5–6. Timeline sự kiện · Replay',
      outcomeAnalysis: '7. Phân tích kết quả',
      rootCause: '8. Nguyên nhân gốc',
      evidence: '9. Cơ sở đánh giá',
      aiSummary: '10. Tóm tắt AI',
      coin: 'Đồng coin',
      strategy: 'Chiến lược',
      direction: 'Hướng',
      pnl: 'Lợi nhuận',
      holding: 'Thời gian giữ',
      status: 'Trạng thái',
      decision: 'Quyết định',
      confidence: 'Độ tin cậy',
      trigger: 'Trigger',
      entryReason: 'Lý do vào lệnh',
      trend: 'Xu hướng',
      btcContext: 'Ngữ cảnh BTC',
      volatility: 'Biến động',
      structure: 'Cấu trúc',
      liquidity: 'Thanh khoản',
      session: 'Phiên',
      success: 'Thành công',
      failure: 'Thất bại',
      executionQ: 'Chất lượng thực thi',
      riskQ: 'Chất lượng rủi ro',
      discipline: 'Kỷ luật',
      advisorAcc: 'Độ chính xác Advisor',
      category: 'Danh mục',
      yes: 'CÓ',
      no: 'KHÔNG',
      recommendationCol: 'Khuyến nghị',
    },
    insightsScreen: {
      equityCurve: 'ĐƯỜNG CONG VỐN',
      equityNeedClosed: '📈 Cần ít nhất 2 lệnh đã đóng để hiển thị đường cong vốn',
      closed: 'Đã đóng',
      winRate: 'Tỷ lệ thắng',
      best: 'Tốt nhất',
      worst: 'Kém nhất',
    },
    phrases: {
      'Best performer': 'Hiệu suất tốt nhất',
      'Winning streak': 'Chuỗi thắng',
      'Max drawdown': 'Sụt giảm vốn lớn nhất',
      'Profit factor': 'Hệ số lợi nhuận',
      trades: 'lệnh',
    },
  },
  header: {
    title: 'TradeScore',
    tagline: 'Bảng điều khiển giao dịch SMC',
    systemReady: 'Đang kết nối',
    systemLive: 'Dữ liệu trực tiếp',
    refreshSec: (s: number) => `Làm mới ${s}s`,
    tierBadge: (tier: string) => tier,
  },
  settings: {
    title: 'Cài đặt',
    subtitle: 'Quản lý vốn và tham số giao dịch động',
  },
  capital: {
    sectionTitle: 'QUẢN LÝ VỐN',
    currentCapitalLabel: 'Vốn hiện tại (USDT)',
    initialCapital: 'Vốn ban đầu',
    nextMilestone: 'Milestone tiếp',
    remaining: 'Còn cần',
    progressTo: (tier: string) => `đến ${tier}`,
    updateBtn: 'Cập nhật vốn',
    invalidInput: 'Nhập số dương, tối đa 2 chữ số thập phân',
    tierActive: 'Đang áp dụng',
    sizePerTrade: 'Size/lệnh',
    notional: 'Notional',
    maxLossTrade: 'Max Loss/lệnh',
    maxLossDay: 'Max Loss/ngày',
    slDistance: 'SL distance',
    fromEntry: 'từ entry',
    tp1: 'TP1 (R:R 2:1)',
    tp2: 'TP2 (R:R 3:1)',
    tp3: 'TP3 (R:R 4.5:1)',
    milestoneTitle: (tier: string) => `LÊN CẤP ${tier}!`,
    milestoneSubtitle: (capital: string) => `Vốn đã tăng 30% lên $${capital}`,
    milestoneApplied: 'Tham số mới đã được áp dụng:',
    milestoneContinue: (tier: string) => `Tiếp tục giao dịch với ${tier}!`,
    milestoneConfirm: (tier: string) => `Bắt đầu ${tier}`,
  },
  tradePlanView: {
    maxLossTooltipIntro: 'Max Loss = lỗ tối đa nếu chạm SL',
    maxLossTooltipTier: (tier: string, limit: string) =>
      `Giới hạn tier ${tier}: ${limit} USDT`,
    maxLossTooltipActual: (actual: string) => `Thực tế lệnh này: ${actual} USDT`,
    tpLowProbHidden: (n: number, pct: string) =>
      `TP${n}: Xác suất ${pct}% — quá thấp, không khuyến nghị`,
    waitBanner: '⚠️ Điểm chưa đủ — chỉ tham khảo, CHƯA VÀO LỆNH',
    waitForRrEntry: (entryLimit: string) =>
      `🎯 Chờ giá về ${entryLimit} để R:R đạt 2:1`,
  },
  ai: {
    title: 'Điểm AI',
    loading: 'Đang tính điểm AI…',
    entryQuality: 'Chất lượng điểm vào',
    mae: 'MAE',
    liqDist: 'Cách vùng thanh khoản',
    topLayers: 'Top 5 lớp đóng góp',
    currentOnSpectrum: 'Vị trí trên thang điểm',
    bias: {
      STRONG_LONG: 'Long mạnh',
      LONG: 'Thiên Long',
      NEUTRAL: 'Trung lập',
      SHORT: 'Thiên Short',
      STRONG_SHORT: 'Short mạnh',
    } satisfies Record<ScoreBias, string>,
  },
  signalBoard: {
    title: 'Bảng tín hiệu tổng hợp',
    subtitle: 'BTC · NEAR · SOL · BNB',
    scorerV2: 'V2',
    scorerV3: 'V3',
    scorerV4: 'V4',
    scorerEngine: 'Engine chấm điểm',
    rescan: 'Quét lại',
    scanning: 'Đang quét tất cả cặp…',
    scannedAt: (t: string) => `Cập nhật lúc ${t}`,
    autoTag: 'tự động',
    autoSchedule: 'tự quét mỗi 60s',
    tierBadgeHint: 'Quản lý vốn',
    alert: (n: number, list: string) => `🔥 ${n} cặp đủ điểm vào lệnh: ${list}`,
    alertNone: 'Chưa có cặp nào đủ điểm — đứng ngoài quan sát',
    trendUp: 'Tăng',
    trendDown: 'Giảm',
    trendFlat: 'Đi ngang',
    long: 'LONG',
    short: 'SHORT',
    biasLabel: 'Thiên hướng',
    planTitle: 'Kế hoạch lệnh',
    entry: 'Entry',
    stopLoss: 'Cắt lỗ (SL)',
    tp: (n: number) => `Chốt lời TP${n}`,
    noEntry: 'Chưa đủ điểm — đứng ngoài quan sát',
    showDetail: 'Xem chi tiết 11 lớp',
    hideDetail: 'Ẩn chi tiết',
    openPosition: (dir: string) => `Mở lệnh ${dir}`,
    confirmOpened: '✅ Đã vào lệnh (Market/Fill ngay)',
    placePending: '⏳ Đặt lệnh chờ (Limit order)',
    pendingPlaced: 'Đã đặt lệnh chờ — tự khớp khi chạm entry',
    closePlan: 'Đóng',
    recordSkip: '📝 Bỏ qua — Ghi nhận setup này',
    skipRecorded: 'Đã ghi nhận — setup sẽ được theo dõi',
    runningPosition: 'Lệnh đang chạy',
    unrealizedPnl: 'PnL chưa chốt',
    realizedPnl: 'PnL đã chốt',
    totalPnl: 'Tổng PnL',
    partialCloseTitle: 'Chốt một phần',
    partialCloseConfirm: 'Xác nhận',
    partialCloseCancel: 'Huỷ',
    roe: 'ROE',
    markPrice: 'Giá Mark',
    margin: 'Margin (Cost)',
    notional: 'Size (USDT)',
    marginSizeFormula: (margin: string, lev: number, size: string) =>
      `${margin} × ${lev}x = ${size}`,
    alreadyOpen: '● Đang có lệnh chạy — xem ở “Lệnh đang chạy”',
    manualOpen: '⚠ Mở lệnh thủ công (chưa đủ điểm)',
    manualWarn: (dir: string) =>
      `Coin chưa đủ điểm vào lệnh. Vẫn mở ${dir} theo giá hiện tại? Rủi ro cao hơn khuyến nghị.`,
    manualConfirm: 'Xác nhận mở',
    cancel: 'Huỷ',
    adx: {
      sectionTitle: '📊 ADX — Độ mạnh xu hướng',
      hint:
        'ADX đo độ mạnh xu hướng (0-100). Không phân biệt tăng hay giảm — chỉ đo xu hướng có rõ không. Nguồn: Binance klines 1H + 4H',
      metricsHeader: 'Chỉ số',
      colMetric: 'Chỉ số',
      colValue: 'Giá trị',
      colMeaning: 'Ý nghĩa',
      adx1h: 'ADX 1H',
      adx4h: 'ADX 4H',
      adxAvg: 'ADX TB',
      meaning1h: 'Độ mạnh xu hướng khung 1 giờ',
      meaning4h: 'Độ mạnh xu hướng khung 4 giờ',
      meaningAvg: 'Trung bình 2 khung',
      regimeHeader: 'Đánh giá regime',
      planAdjustTitle: 'Kế hoạch đã được điều chỉnh theo độ mạnh xu hướng:',
      weakTpLine: (mult: string) => `📉 TP gần hơn bình thường (×${mult})`,
      weakSlLine: (mult: string) => `📈 SL rộng hơn bình thường (×${mult})`,
      weakReason:
        'Lý do: Xu hướng yếu, tránh kỳ vọng quá cao trong thị trường tích lũy',
      strongTpLine: (mult: string) => `📈 TP xa hơn bình thường (×${mult})`,
      strongSlLine: (mult: string) => `📉 SL chặt hơn bình thường (×${mult})`,
      strongReason: 'Lý do: Xu hướng mạnh, giá có thể tiếp tục đi xa theo momentum',
      regimes: {
        CHOPPY: {
          badge: '🔴 CHOPPY (ADX < 15)',
          description:
            'Thị trường đang lình xình, không có xu hướng rõ ràng. Tỷ lệ bị stop out do nhiễu rất cao.',
          action: '→ Hệ thống đã CHẶN entry.',
        },
        RANGING: {
          badge: '🟡 RANGING (ADX 15-25)',
          description:
            'Xu hướng yếu, thị trường đang tích lũy trong biên độ hẹp. Không kỳ vọng giá đi xa.',
          action: '→ TP thu hẹp ×0.85, SL nới ×1.1',
        },
        TRENDING_WEAK: {
          badge: '🟢 TRENDING WEAK (ADX 25-35)',
          description: 'Xu hướng đang hình thành, momentum đang tăng dần.',
          action: '→ TP/SL giữ nguyên',
        },
        TRENDING_STRONG: {
          badge: '💚 TRENDING STRONG (ADX > 35)',
          description:
            'Xu hướng mạnh và rõ ràng, momentum cao. Giá có thể đi xa hơn dự kiến theo xu hướng hiện tại.',
          action: '→ TP mở rộng ×1.2, SL siết ×0.9',
        },
      },
    },
    structureSL: {
      title: '🏗️ SL theo cấu trúc giá 4H',
      tooltip:
        'SL đặt sau swing high/low gần nhất trên 4H thay vì chỉ ATR. Tránh bị stop out do nhiễu.',
      metricsHeader: 'Chỉ số',
      colMetric: 'Chỉ số',
      colValue: 'Giá trị',
      swingPoint: 'Swing point',
      candlesBack: 'nến 4H trước',
      buffer: 'Buffer',
      structureSLPrice: 'SL cấu trúc',
      atrSLPrice: 'SL ATR gốc',
      atrUnavailable: '—',
      appliedSL: 'SL áp dụng',
      distance: 'Khoảng cách',
      statusLabel: 'Trạng thái',
      sourceFallback: 'Không tìm được swing hợp lệ',
      fallbackNote: 'Dùng ATR×N như cũ',
      atrTag: 'ATR',
      badgeWider: '⚠️ SL rộng hơn ATR',
      badgeTighter: '✅ SL chặt hơn ATR',
      badgeFallback: 'ℹ️ Dùng ATR mặc định',
      badges: {
        wider: {
          description:
            'Swing xa — SL phải rộng hơn để đúng cấu trúc. R:R giảm nhẹ.',
        },
        tighter: {
          description:
            'Swing gần — SL chặt hơn bình thường. R:R cải thiện.',
        },
        fallback: {
          description:
            'Không tìm được swing 4H hợp lệ trong 20 nến gần nhất.',
        },
      },
    },
    vwap: {
      title: 'VWAP — Giá trung bình theo khối lượng',
      tooltip:
        'VWAP là mức giá công bằng mà phần lớn volume đã giao dịch trong ngày. Tổ chức thường mua/bán tại vùng này.',
      metricsHeader: 'Chỉ số',
      colMetric: 'Chỉ số',
      colValue: 'Giá trị',
      vwapPrice: 'VWAP ngày',
      upperBand2: 'Band trên +2σ',
      upperBand1: 'Band trên +1σ',
      currentPrice: 'Giá hiện tại',
      lowerBand1: 'Band dưới -1σ',
      lowerBand2: 'Band dưới -2σ',
      priceVsVwap: '% so VWAP',
      zone: 'Vùng giá',
      entrySignal: 'Tín hiệu entry VWAP',
      bonusLabel: '+0.5đ L5 Volume — giá tại VWAP',
      zones: {
        ABOVE_BAND2: 'Quá mua — trên +2σ',
        ABOVE_BAND1: 'Trên +1σ',
        NEAR_VWAP: 'Tại VWAP — vùng lý tưởng',
        BELOW_BAND1: 'Dưới -1σ',
        BELOW_BAND2: 'Quá bán — dưới -2σ',
        BETWEEN: 'Trung tính',
      },
      zoneDetails: {
        ABOVE_BAND2: {
          badge: '⚠️ Quá mua — trên +2σ',
          description:
            'Giá quá cao so VWAP, rủi ro Long cao. Thuận Short.',
        },
        ABOVE_BAND1: {
          badge: '↑ Trên +1σ',
          description: 'Giá đang mạnh hơn VWAP. Long cẩn thận, Short có cơ hội.',
        },
        NEAR_VWAP: {
          badge: '✅ Tại VWAP — vùng lý tưởng',
          description:
            'Giá tại vùng công bằng. Entry Long hoặc Short đều có xác suất tốt.',
        },
        BELOW_BAND1: {
          badge: '↓ Dưới -1σ',
          description: 'Giá đang yếu hơn VWAP. Short cẩn thận, Long có cơ hội.',
        },
        BELOW_BAND2: {
          badge: '⚠️ Quá bán — dưới -2σ',
          description: 'Giá quá thấp so VWAP, rủi ro Short cao. Thuận Long.',
        },
        BETWEEN: {
          badge: '↔ Trung tính',
          description: 'Giá nằm trong band bình thường.',
        },
      },
      quality: {
        IDEAL: 'Entry VWAP lý tưởng',
        GOOD: 'Đang pullback về VWAP',
        POOR: 'Không đề xuất entry VWAP',
        NEUTRAL: '',
      },
      qualityDetails: {
        IDEAL: {
          badge: '🎯 Entry VWAP lý tưởng',
          description:
            'Giá đang tại VWAP ± 0.5%. Đây là vùng entry tốt nhất.',
          suggestedLabel: (price: string) => `Mức đề xuất: ${price}`,
        },
        GOOD: {
          badge: '📍 Đang pullback về VWAP',
          description: 'Giá đang tiến về VWAP.',
          suggestedLabel: (price: string) => `Có thể đặt limit tại: ${price}`,
        },
        POOR: {
          badge: '📵 Không đề xuất entry VWAP',
          description: 'Giá quá xa VWAP. Chờ pullback về vùng hợp lý.',
          suggestedLabel: () => '',
        },
      },
    },
  },
  pendingOrder: {
    title: 'Lệnh chờ limit',
    limitEntry: 'Entry chờ',
    distance: 'Còn cách',
    nearFill: 'Sắp khớp ✓',
    cancel: 'Huỷ lệnh chờ',
    autoCancel: (time: string) => `Tự hủy sau: ${time}`,
    expiring: 'Đang hủy lệnh chờ (hết hạn)...',
    autoCancelWithPlan: (time: string, score: number, expiryHours: number) =>
      `Tự hủy sau: ${time} (Score ${score.toFixed(1)} → ${expiryHours}h plan)`,
    confirmFill: '✅ ĐÃ FILL',
    cancelLocked: '❌ HỦY',
  },
  recommend: {
    title: 'Bảng khuyến nghị giá',
    subtitle: 'Entry limit tối ưu từ chỉ báo phiên — đặt lệnh chờ trên Binance',
    colParam: 'Thông số',
    colPrice: 'Giá nhập',
    entry: 'Entry limit (chờ khớp)',
    entryHint: 'Giá vào tốt nhất — LONG thấp hơn mark, SHORT cao hơn mark',
    sl: 'Stop Loss (cắt lỗ)',
    slHint: 'SL tối ưu theo ATR ×2 + vùng thanh khoản',
    tp: (n: number) => `Take Profit ${n} (TP${n})`,
    tpHint: (n: number) =>
      n === 1 ? 'Chốt 30–40% khối lượng' : n === 2 ? 'Chốt thêm 30%' : 'Chốt phần còn lại / trailing',
    footer: 'Giá gợi ý từ 10 lớp chỉ báo phiên — sửa nếu cần rồi đặt lệnh chờ',
    resetSuggested: 'Dùng giá gợi ý',
    invalidPrice: 'Giá không hợp lệ',
    marketNow: 'Giá Mark hiện tại',
    entryReason: (reason: string) => `Lý do entry: ${reason}`,
    entryVsMark: (entry: string, mark: string, pct: string) =>
      `Entry ${entry} · Mark ${mark} · cách ${pct}`,
    capitalSection: 'Vốn & đòn bẩy',
    marginLabel: 'Cost / Margin (USDT)',
    marginHint: 'Số tiền bạn bỏ vào lệnh — giống ô Cost trên Binance Futures',
    leverageLabel: 'Đòn bẩy',
    notionalHint: (margin: number, lev: number, notional: number) =>
      `Quy mô lệnh: $${margin.toFixed(2)} × ${lev}x = $${notional.toFixed(2)} USDT`,
    invalidMargin: 'Số tiền không hợp lệ',
    showDetail: 'Xem chi tiết kế hoạch',
    hideDetail: 'Ẩn chi tiết kế hoạch',
    collapsedSummary: (entry: string, sl: string, margin: string, lev: number) =>
      `Entry ${entry} · SL ${sl} · ${margin} × ${lev}x`,
    entryZoneTitle: '📍 VÙNG ENTRY ĐỀ XUẤT',
    entryZoneType: 'Loại',
    entryZoneLimit: 'Limit tại',
    entryZoneRange: 'Vùng',
    entryZoneFarWarning:
      '⚠️ Vùng entry cách giá hiện tại khá xa, có thể không khớp ngay — đặt limit & chờ',
    entryZoneTypes: {
      PULLBACK_EMA: 'Chờ pullback EMA20',
      WALL_SUPPORT: 'Whale Wall',
      BREAKOUT_RETEST: 'Breakout retest',
      MARKET_NEAR: 'Gần thị trường',
    } as Record<string, string>,
    copy: 'Copy',
    rrLabel: 'R:R',
  },
  advanced: {
    show: 'Hiện chi tiết nâng cao',
    hide: 'Ẩn chi tiết nâng cao',
    hint: 'Phân tích chi tiết, quản lý rủi ro, nhật ký, ma trận chấm điểm',
  },
  sections: {
    market: {
      title: 'Dữ liệu thị trường',
      subtitle: 'Giá, OI, funding và độ sâu sổ lệnh từ Binance Futures',
    },
    analysis: {
      title: 'Phân tích kỹ thuật',
      subtitle: 'SMC · CVD · heatmap theo khung phân tích đang chọn',
    },
    risk: {
      title: 'Quản lý rủi ro',
      subtitle: 'Giới hạn vốn và khối lượng mỗi lệnh — tuân thủ trước khi vào lệnh',
    },
    scoring: {
      title: 'Hệ thống chấm điểm',
      subtitle: 'Tick thành phần bên dưới để hiện khi cần',
    },
    store: {
      title: 'Auto-check & Nhật ký',
      subtitle: 'Phase 5 · Zustand · AsyncStorage · phút :02',
    },
  },
  store: {
    title: 'Auto-check & Nhật ký lệnh',
    subtitle: 'Quét mỗi phút · khuyến nghị V3 trên Signal Board (6h–22h VN)',
    ready: 'Store sẵn sàng',
    loading: 'Đang nạp store…',
    persisted: 'Đã lưu cục bộ',
    autoCheck: 'Lịch auto-check',
    vnTime: (h: number, m: number) =>
      `Giờ VN: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    schedule: (start: number, end: number, minute: number) =>
      `Khung ${start}h–${end}h · kích hoạt phút thứ ${minute} mỗi giờ`,
    triggerNow: 'Đang trong phút kích hoạt — auto-check sẽ chạy nếu chưa khóa giờ này',
    inWindow: 'Trong khung giờ vàng — chờ phút kích hoạt',
    outsideWindow: 'Ngoài khung giờ vàng — auto-check tạm dừng',
    runAnalysis: 'Phân tích qua Store',
    lastAnalysis: 'Kết quả Store gần nhất',
    cached: 'cache',
    fetchedAt: (t: string) => `Cập nhật lúc ${t}`,
    noAnalysis: 'Chưa chạy phân tích qua Store — bấm nút phía trên',
    journal: 'Nhật ký lệnh',
    addDemo: 'Thêm lệnh demo (OPEN)',
    noOpen: 'Không có lệnh OPEN',
    closeTrade: 'Đóng',
    psychology: 'Checklist tâm lý',
    psychologyItems: {
      noRevengeTrading: 'Không trade trả thù',
      withinDailyLossLimit: 'Trong giới hạn lỗ ngày',
      restedAndFocused: 'Đủ nghỉ & tập trung',
      planWritten: 'Đã viết kế hoạch lệnh',
      noOverLeverage: 'Không quá đòn bẩy',
    },
  },
  scorer: {
    title: 'Scorer V2 + V3',
    subtitle: 'Song song 2 hệ thống · LONG/SHORT · thang 15đ',
    sectionSubtitle: (symbol: string) =>
      `${symbol} · Scorer v2 + v3 · 10 lớp + nhóm A/B/C`,
    v2Section: 'Scorer V2 — 10 lớp',
    v3Section: 'Scorer V3 — Nhóm A/B/C',
    primaryEngine: (engine: 'v2' | 'v3') =>
      engine === 'v3' ? 'Quyết định chính: V3' : 'Quyết định chính: V2',
    scoreDelta: (delta: number) =>
      delta >= 0 ? `Δ V3+${delta.toFixed(1)}` : `Δ V3${delta.toFixed(1)}`,
    totalScore: 'Tổng điểm',
    maxScore: '/ 15',
    direction: 'Hướng lệnh',
    long: 'Long',
    short: 'Short',
    suggested: 'Gợi ý SMC',
    suggestedV2: 'Gợi ý v2',
    winrate: (rate: string) => `Winrate gợi ý: ${rate}`,
    canEnter: 'Đủ điều kiện vào',
    layers: '10 lớp chấm điểm',
    mandatory: 'Vi phạm bắt buộc',
    tradePlan: 'Kế hoạch lệnh',
    stopLoss: 'Stop loss',
    takeProfit: (n: number) => `TP${n}`,
    size: 'Khối lượng',
    margin: 'Ký quỹ',
    notional: 'Notional',
    risk: 'Rủi ro tối đa',
    noPlan: 'Chưa đủ điều kiện vào lệnh theo quy tắc Phase 4',
    loading: 'Đang chấm 10 lớp…',
    btc24h: (pct: string) => `BTC 24h: ${pct}%`,
  },
  scoringVisibility: {
    label: 'Hiển thị thành phần',
    hint: 'Tick mục cần xem · bỏ tick để ẩn',
    panels: {
      phase4: 'Scorer V2+V3',
      ai: 'Điểm AI',
      spectrum: 'Thang điểm',
      mtf: 'Đa khung',
      engine: 'Cấu hình',
    },
  },
  overview: {
    exchange: 'Binance Futures · Perpetual',
    bias: 'Điểm AI',
    aiScore: 'Điểm AI',
    waiting: 'Đang phân tích thị trường…',
    biasLabels: {
      LONG: 'THIÊN LONG',
      SHORT: 'THIÊN SHORT',
      NEUTRAL: 'TRUNG LẬP',
      WAIT: 'CHỜ XÁC NHẬN',
    } satisfies Record<TradingBias, string>,
    biasHint: {
      LONG: 'Nhiều tín hiệu đồng thuận tăng',
      SHORT: 'Nhiều tín hiệu đồng thuận giảm',
      NEUTRAL: 'Tín hiệu trộn, chưa rõ hướng',
      WAIT: 'Chờ thêm xác nhận từ cấu trúc',
    } satisfies Record<TradingBias, string>,
    signals: {
      trend: 'Xu hướng SMC',
      structure: 'Cấu trúc',
      divergence: 'Phân kỳ CVD',
      regime: 'Chế độ TT',
    },
    analysisTfBadge: (tf: AnalysisTimeframe) => `Phân tích · ${tf}`,
    hints: {
      trend: 'Hướng sóng chính trên khung phân tích',
      structure: 'BOS = tiếp diễn xu hướng · CHoCH = đảo chiều',
      divergence: 'Giá và khối lượng lệch pha nhau',
      regime: 'Bối cảnh thị trường ảnh hưởng trọng số AI',
    },
    tapHint: 'Chạm ô tín hiệu để xem chú thích',
    closeHint: 'Chạm lại ô để đóng',
    summary: (regime: string, trend: string, conf: string, bias: string) =>
      `Thị trường ${regime} (${conf}% tin cậy), xu hướng ${trend}. Gợi ý hiện tại: ${bias}.`,
    explain: {
      trend: (trend: MarketTrend, tf: AnalysisTimeframe) => {
        if (trend === 'BULLISH') {
          return `Đỉnh và đáy fractal đang tạo chuỗi cao dần trên khung ${tf}. Bối cảnh ưu tiên tìm long theo sóng chính, tránh short ngược xu hướng.`;
        }
        if (trend === 'BEARISH') {
          return `Đỉnh và đáy fractal đang tạo chuỗi thấp dần trên khung ${tf}. Bối cảnh ưu tiên tìm short theo sóng chính, tránh long bắt đáy sớm.`;
        }
        return `Swing high/low chưa xếp thành xu hướng rõ trên khung ${tf}. Nên chờ BOS/CHoCH hoặc hội tụ thêm khung nhỏ trước khi vào lệnh.`;
      },
      structure: (type: StructureType | null, trend: MarketTrend, breakAt?: string) => {
        const at = breakAt ? ` Mức phá: ${breakAt}.` : '';
        if (!type) {
          return 'Chưa phát hiện BOS hay CHoCH trên nến gần nhất. Cấu trúc chưa xác nhận — chờ phá swing quan trọng.';
        }
        if (type === 'BOS' && trend === 'BEARISH') {
          return `Break of Structure theo hướng giảm: giá phá đáy swing, xu hướng bearish tiếp diễn.${at}`;
        }
        if (type === 'BOS' && trend === 'BULLISH') {
          return `Break of Structure theo hướng tăng: giá phá đỉnh swing, xu hướng bullish tiếp diễn.${at}`;
        }
        if (type === 'BOS') {
          return `BOS — phá cấu trúc theo hướng xu hướng hiện tại, thường là tín hiệu tiếp diễn.${at}`;
        }
        if (type === 'CHOCH') {
          return `Change of Character — phá ngược cấu trúc cũ, gợi ý đảo tính chất thị trường. Cần xác nhận thêm trước khi đảo bias.${at}`;
        }
        return '';
      },
      divergence: (type: CVDDivergenceType) => {
        if (type === 'BEARISH') {
          return 'Phân kỳ giảm: giá tạo đỉnh cao hơn nhưng CVD (khối lượng mua ròng tích lũy) tạo đỉnh thấp hơn. Lực mua yếu — thường ủng hộ áp lực giảm.';
        }
        if (type === 'BULLISH') {
          return 'Phân kỳ tăng: giá tạo đáy thấp hơn nhưng CVD tạo đáy cao hơn. Lực bán suy yếu — thường ủng hộ hồi phục hoặc đảo tăng.';
        }
        return 'Giá và CVD đang đồng pha, chưa có phân kỳ rõ. Dòng lệnh chưa cho tín hiệu đảo chiều độc lập.';
      },
      regime: (regime: MarketRegime, funding: FundingOIRegime, confPct: string) => {
        const regimeNote: Record<MarketRegime, string> = {
          TRENDING_BULL: 'Thị trường trending tăng — AI tăng trọng số EMA, BOS, MTF theo hướng long.',
          TRENDING_BEAR: 'Thị trường trending giảm — AI tăng trọng số theo hướng short.',
          MEAN_REVERSION: 'Thị trường hồi về trung bình — ưu tiên RSI, Bollinger, vùng S/R.',
          HIGH_VOLATILITY_CHOP: 'Biến động mạnh, sideway — giảm độ tin cậy trend-follow.',
        };
        const fundingNote: Record<FundingOIRegime, string> = {
          LONG_SQUEEZE_RISK: 'Rủi ro xả Long: nhiều long, funding cao — giá có thể quét xuống trước.',
          SHORT_SQUEEZE_RISK: 'Rủi ro xả Short: nhiều short, funding âm — giá có thể bật mạnh nếu short bị ép đóng.',
          ACCUMULATION: 'Tích lũy: OI tăng, funding thấp — smart money có thể gom hàng.',
          DISTRIBUTION: 'Phân phối: OI giảm sau đợt tăng — lực chốt lời xuất hiện.',
          NEUTRAL: 'Funding/OI trung lập — chưa có tín hiệu squeeze rõ.',
        };
        return `${regimeNote[regime]} Độ tin cậy chế độ: ${confPct}%. ${fundingNote[funding]}`;
      },
    },
  },
  symbols: {
    BTCUSDT: 'BTC',
    NEARUSDT: 'NEAR',
    SOLUSDT: 'SOL',
    BNBUSDT: 'BNB',
    pickerTitle: 'Chọn cặp giao dịch',
    searchPlaceholder: 'Tìm BTC, NEAR, SOL…',
    perpetual: 'Vĩnh cửu',
    pairColumn: 'Cặp',
    typeColumn: 'Loại',
    noResults: 'Không tìm thấy cặp phù hợp',
  } satisfies Record<AppTradeSymbol, string> & {
    pickerTitle: string;
    searchPlaceholder: string;
    perpetual: string;
    pairColumn: string;
    typeColumn: string;
    noResults: string;
  },
  market: {
    title: 'Dữ liệu thị trường',
    caption: (symbol: string, tickSec: number) =>
      `${symbol} · Binance Futures · cập nhật ${tickSec}s`,
    loading: 'Đang tải đa khung thời gian…',
    lastPrice: 'Giá hiện tại',
    spread: (bid: string, ask: string, spread: string) =>
      `Mua ${bid} · Bán ${ask} · Chênh ${spread}`,
    updatedAgo: (sec: number) => `Cập nhật ${sec}s trước`,
    openInterest: 'Hợp đồng mở (OI)',
    oiHint: 'Tổng vị thế đang mở trên sàn',
    funding: 'Funding',
    fundingHint: 'Phí giữ lệnh qua đêm · âm = short trả long',
    depthLevels: 'Độ sâu sổ lệnh',
    depthHint: 'Mức bid / ask trong sổ lệnh',
    timeframes: 'Khung thời gian',
    tfHint: 'Số khung đã tải (5m → 1d)',
    live: 'TRỰC TIẾP',
    cache: 'BỘ NHỚ ĐỆM',
    status: (interval: number, warnings: number) =>
      `Quét đầy đủ mỗi ${interval}s · ${warnings} cảnh báo`,
    accountMargin: 'Ký quỹ USDT',
    isolated: (lev: number) => `${lev}x isolated`,
    equityPct: (pct: string) => `${pct}% vốn`,
    monthly: (v: string) => `Tháng $${v}`,
  },
  risk: {
    section: 'Thông số rủi ro',
    equity: 'Vốn tài khoản',
    equityHint: 'Tổng số dư dùng để tính % rủi ro',
    positionSize: 'Margin / lệnh',
    positionHint: 'Cost mỗi lệnh trên Binance (× đòn bẩy = Size USDT)',
    maxLossTrade: 'Lỗ tối đa / lệnh',
    maxLossHint: 'Stop-loss tuyệt đối cho mỗi giao dịch',
    weeklyCap: 'Giới hạn tuần',
    weeklyHint: 'Trần lỗ tích lũy trong 7 ngày',
  },
  analysisTf: {
    title: 'Khung phân tích',
    subtitle: (tf: AnalysisTimeframe) =>
      `Chỉ báo & điểm AI đang tính theo ${tf}`,
  },
  analysis: {
    section: 'Giai đoạn 3 · Engine phân tích',
    loading: 'Đang chạy SMC · CVD · Heatmap…',
    marketRegime: 'Chế độ thị trường',
    regimeMeta: (trend: string, bb: string) => `Xu hướng ${trend} · BB rộng ${bb}`,
    regimeHint: 'Tự đồng bộ ma trận trọng số AI bên dưới',
    confidence: (pct: number) => `${pct}%`,
    confidenceLabel: (pct: string) => `Độ tin cậy: ${pct}%`,
  },
  smc: {
    title: 'Cấu trúc SMC',
    caption: (tf: string) => `${tf} · Nhận diện sóng fractal`,
    trend: 'Xu hướng',
    swings: 'Sóng',
    swingsVal: (h: number, l: number) => `${h} đỉnh / ${l} đáy`,
    noSignal: 'Chưa có BOS/CHoCH trên nến mới nhất',
    breakAt: (price: string, time: string) => `Phá vỡ @ ${price} · ${time}`,
    structure: {
      BOS: 'Phá cấu trúc (BOS)',
      CHOCH: 'Đảo tính chất (CHoCH)',
      NONE: '—',
    } satisfies Record<StructureType, string>,
    swingHigh: 'ĐỈNH',
    swingLow: 'ĐÁY',
  },
  orderFlow: {
    title: 'Dòng lệnh & CVD',
    caption: 'Tích lũy khối lượng · OI · Tốc độ funding',
    cvd: 'CVD',
    deltaOi: 'ΔOI',
    fundVel: 'Tốc độ fund',
    fundVelVal: (bps: string) => `${bps} bps/h`,
    divergence: 'Phân kỳ',
    cvdInsufficient: 'Chưa đủ dữ liệu CVD',
    divType: {
      BULLISH: 'Phân kỳ tăng',
      BEARISH: 'Phân kỳ giảm',
      NONE: 'Không có',
    } satisfies Record<CVDDivergenceType, string>,
    divNote: {
      BULLISH: 'Giá đáy thấp hơn, CVD đáy cao hơn',
      BEARISH: 'Giá đỉnh cao hơn, CVD đỉnh thấp hơn',
      NONE: '',
    } satisfies Record<CVDDivergenceType, string>,
  },
  heatmap: {
    title: 'Bản đồ thanh khoản',
    captionWeb: 'Tường sổ lệnh + thanh lý · ≥5× TB · Web',
    captionSkia: 'Tường sổ lệnh + thanh lý · ≥5× TB · Skia',
    empty: 'Không có cụm thanh khoản ≥ 5× trung bình',
    footer: (avg: string, pools: number) => `TB khối lượng ${avg} · ${pools} vùng`,
    lastPrice: (p: string) => `Giá ${p}`,
  },
  regime: {
    TRENDING_BULL: 'Xu hướng tăng',
    TRENDING_BEAR: 'Xu hướng giảm',
    MEAN_REVERSION: 'Hồi về trung bình',
    HIGH_VOLATILITY_CHOP: 'Biến động mạnh',
  } satisfies Record<MarketRegime, string>,
  regimeTab: {
    TRENDING_BULL: 'Tăng',
    TRENDING_BEAR: 'Giảm',
    MEAN_REVERSION: 'Hồi TB',
    HIGH_VOLATILITY_CHOP: 'Biến động',
  } satisfies Record<MarketRegime, string>,
  trend: {
    BULLISH: 'TĂNG',
    BEARISH: 'GIẢM',
    SIDEWAYS: 'ĐI NGANG',
  } satisfies Record<MarketTrend, string>,
  fundingOi: {
    LONG_SQUEEZE_RISK: 'Rủi ro xả Long',
    SHORT_SQUEEZE_RISK: 'Rủi ro xả Short',
    ACCUMULATION: 'Tích lũy',
    DISTRIBUTION: 'Phân phối',
    NEUTRAL: 'Trung lập',
  } satisfies Record<FundingOIRegime, string>,
  matrix: {
    title: 'Ma trận trọng số AI',
    caption: 'Phân bổ lớp động theo chế độ thị trường',
    layer: 'Lớp',
    weight: 'Trọng số',
    liveScore: 'Điểm',
    distribution: 'Phân bổ',
  },
  matrixToggle: {
    label: 'Ma trận trọng số AI',
    hint: 'Engine vẫn chấm điểm 14 lớp · tick khi cần xem bảng chi tiết',
    on: 'Đang hiện',
    off: 'Đang ẩn',
  },
  spectrum: {
    title: 'Thang điểm tín hiệu',
    caption: 'Điểm 0–100: càng cao càng thiên Long',
    shortBias: 'Thiên Short',
    neutral: 'Trung lập',
    longBias: 'Thiên Long',
    zones: {
      SS: 'Short mạnh',
      S: 'Short',
      N: 'Trung lập',
      L: 'Long',
      SL: 'Long mạnh',
    },
  },
  timeframe: {
    title: 'Chuỗi đa khung thời gian',
    hint: 'Luồng hội tụ HTF → LTF',
    tapHint: 'Chạm vào khung để xem chú thích',
    closeHint: 'Chạm lại khung để đóng',
    summary: (loaded: number, total: number, bull: number, bear: number) => {
      if (loaded === 0) return 'Đang chờ dữ liệu khung thời gian…';
      const parts = [`${loaded}/${total} khung đã tải`];
      if (bull > 0) parts.push(`${bull} tăng`);
      if (bear > 0) parts.push(`${bear} giảm`);
      const neutral = loaded - bull - bear;
      if (neutral > 0) parts.push(`${neutral} đi ngang`);
      return parts.join(' · ');
    },
    detail: {
      trend: 'Xu hướng',
      structure: 'Tín hiệu SMC',
      close: 'Giá đóng',
      swings: 'Sóng fractal',
      role: 'Vai trò',
      noData: 'Chưa tải được dữ liệu khung này.',
      noSignal: 'Chưa có BOS/CHoCH gần nhất',
      analysisTf: 'Khung phân tích chính của engine',
      aligned: 'Đồng pha với đa số khung đã tải',
      notAligned: 'Lệch pha so với đa số khung đã tải',
    },
    roles: {
      '5m': 'Siêu ngắn — timing vào lệnh',
      '15m': 'Ngắn — xác nhận momentum',
      '1h': 'Trung — phân tích chính',
      '4h': 'Cao — bias intraday',
      '1d': 'Cao nhất — hướng tuần / tháng',
    } satisfies Record<Timeframe, string>,
  },
  engine: {
    title: 'Cấu hình engine',
    layers: 'Số lớp',
    autoScan: 'Tự quét',
    trigger: 'Kích hoạt',
    triggerVal: (m: string) => `:${m} mỗi giờ`,
    api: 'API',
    apiVal: 'Binance Futures',
    detectedRegime: 'Chế độ phát hiện',
  },
} as const;

export const LAYER_LABELS_VI: Record<LayerName, string> = {
  EMA_TREND: 'Xu hướng EMA',
  BOS_CHOCH: 'BOS / CHoCH',
  RSI: 'RSI',
  MACD: 'MACD',
  BOLLINGER: 'Bollinger',
  VOLUME_PROFILE: 'Hồ sơ khối lượng',
  CVD_DIVERGENCE: 'Phân kỳ CVD',
  FUNDING_OI: 'Funding / OI',
  LIQUIDITY_POOL: 'Vùng thanh khoản',
  ORDERBOOK_IMBALANCE: 'Mất cân bằng sổ lệnh',
  ATR_VOLATILITY: 'Biến động ATR',
  SUPPORT_RESISTANCE: 'Hỗ trợ / Kháng cự',
  MTF_CONFLUENCE: 'Hội tụ đa khung',
  ENTRY_QUALITY: 'Chất lượng vào lệnh',
};

export function formatLayerVi(name: LayerName): string {
  return LAYER_LABELS_VI[name];
}

export function formatRegimeVi(regime: MarketRegime): string {
  return vi.regime[regime];
}

export function formatRegimeTabVi(regime: MarketRegime): string {
  return vi.regimeTab[regime];
}

export function formatTrendVi(trend: MarketTrend): string {
  return vi.trend[trend];
}

export function formatFundingOiVi(regime: FundingOIRegime): string {
  return vi.fundingOi[regime];
}

export function formatStructureVi(type: StructureType): string {
  return vi.smc.structure[type];
}

export function formatDivergenceVi(type: CVDDivergenceType): string {
  return vi.orderFlow.divType[type];
}

export function formatScoreBiasVi(bias: ScoreBias): string {
  return vi.ai.bias[bias];
}

export function symbolLabelVi(symbol: AppTradeSymbol): string {
  return vi.symbols[symbol];
}

/** Task 15.8.1 — Trading Coach section / status labels (UI display). */
export function tradingCoachTitleVi(): string {
  return vi.tradingCoach.title;
}

export function tradingCoachSectionVi(
  key: keyof typeof vi.tradingCoach.sections,
): string {
  return vi.tradingCoach.sections[key];
}

export function tradingCoachStatusVi(
  status: keyof typeof vi.tradingCoach.status,
): string {
  return vi.tradingCoach.status[status];
}

export function tradingCoachPriorityVi(
  priority: keyof typeof vi.tradingCoach.priority,
): string {
  return vi.tradingCoach.priority[priority];
}
