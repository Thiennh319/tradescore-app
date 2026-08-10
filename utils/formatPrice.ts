import type { AppTradeSymbol } from '../constants/scoring';

/**
 * Số thập phân HIỂN THỊ UI (`formatPrice` / `formatUsdPrice`).
 * Khác tickSize sàn: LINK/AVAX Futures tickSize 0.10 nhưng UI dùng 3 dp để theo dõi.
 * Không đặt lại bước giá lệnh trên sàn.
 */
export const PRICE_DECIMALS: Record<AppTradeSymbol, number> = {
  BTCUSDT: 2,
  NEARUSDT: 3,
  SOLUSDT: 2,
  BNBUSDT: 2,
  XRPUSDT: 4,
  /** ETH ~$1.9k–3.4k — 1 dp đủ; tickSize Futures 0.10 */
  ETHUSDT: 1,
  /** UI display 3 dp (tickSize sàn vẫn 0.10) */
  LINKUSDT: 3,
  AVAXUSDT: 3,
};

/** Luôn dùng en-US khi hiển thị số — tránh "6,00" bị parse thành 600 trên máy VN. */
const NUMBER_LOCALE = 'en-US';

export function priceDecimals(symbol: string): number {
  return PRICE_DECIMALS[symbol as AppTradeSymbol] ?? 2;
}

export function formatPrice(symbol: string, price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '—';
  const digits = priceDecimals(symbol);
  return price.toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatUsdPrice(symbol: string, price: number | null | undefined): string {
  const formatted = formatPrice(symbol, price);
  return formatted === '—' ? '—' : `$${formatted}`;
}

/**
 * Parse số nhập tay — hỗ trợ cả "6.00", "6,00", "2.019", "2,019", "1,234.56".
 * Trên máy locale VN, formatUsdt(6) từng ra "6,00"; bỏ dấu phẩy sẽ thành 600 — hàm này tránh lỗi đó.
 */
export function parseLocalizedNumber(text: string): number | null {
  let s = text.replace(/[$\s\u00A0]/g, '').trim();
  if (!s) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma >= 0) {
    const commaMatch = /^(\d+),(\d+)$/.exec(s);
    if (commaMatch) {
      const whole = commaMatch[1];
      const frac = commaMatch[2];
      if (frac.length === 2) {
        s = `${whole}.${frac}`;
      } else if (/^0+$/.test(frac) && whole.length >= 2) {
        s = `${whole}${frac}`;
      } else if (frac.length <= 8 && Number(`${whole}.${frac}`) < 1000) {
        s = `${whole}.${frac}`;
      } else {
        s = `${whole}${frac}`;
      }
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Parse số tiền USDT nhập tay */
export function parseUsdtInput(text: string): number | null {
  const n = parseLocalizedNumber(text);
  if (n == null) return null;
  return Number.parseFloat(n.toFixed(2));
}

export function formatUsdt(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return amount.toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Parse giá nhập tay — trả null nếu không hợp lệ */
export function parsePriceInput(symbol: string, text: string): number | null {
  const n = parseLocalizedNumber(text);
  if (n == null) return null;
  const digits = priceDecimals(symbol);
  return Number.parseFloat(n.toFixed(digits));
}
