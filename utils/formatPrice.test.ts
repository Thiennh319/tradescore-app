import { describe, expect, it } from 'vitest';
import {
  formatPrice,
  formatUsdPrice,
  formatUsdt,
  parseLocalizedNumber,
  parsePriceInput,
  parseUsdtInput,
  priceDecimals,
} from './formatPrice';

describe('formatPrice', () => {
  it('uses 3 decimals for NEAR like Binance Futures', () => {
    expect(priceDecimals('NEARUSDT')).toBe(3);
    expect(formatPrice('NEARUSDT', 4.5678)).toBe('4.568');
    expect(formatUsdPrice('NEARUSDT', 4.5)).toBe('$4.500');
  });

  it('uses 2 decimals for BTC', () => {
    expect(formatPrice('BTCUSDT', 65000.5)).toBe('65,000.50');
  });

  it('uses 1 decimal for ETH/LINK/AVAX (tickSize 0.10)', () => {
    expect(priceDecimals('ETHUSDT')).toBe(1);
    expect(priceDecimals('LINKUSDT')).toBe(1);
    expect(priceDecimals('AVAXUSDT')).toBe(1);
    expect(formatPrice('ETHUSDT', 3450.15)).toBe('3,450.2');
    expect(formatUsdPrice('LINKUSDT', 18.4)).toBe('$18.4');
    expect(formatUsdPrice('AVAXUSDT', 25.05)).toBe('$25.1');
  });
});

describe('formatUsdt', () => {
  it('uses dot decimal (en-US) so margin 6 is not shown as 6,00', () => {
    expect(formatUsdt(6)).toBe('6.00');
    expect(formatUsdt(600)).toBe('600.00');
  });
});

describe('parseUsdtInput', () => {
  it('parses en-US margin', () => {
    expect(parseUsdtInput('6')).toBe(6);
    expect(parseUsdtInput('6.00')).toBe(6);
    expect(parseUsdtInput('$6.00')).toBe(6);
  });

  it('parses vi-VN margin without turning 6,00 into 600', () => {
    expect(parseUsdtInput('6,00')).toBe(6);
    expect(parseUsdtInput('600,00')).toBe(600);
  });

  it('parses thousands separator', () => {
    expect(parseUsdtInput('1,234.56')).toBe(1234.56);
  });
});

describe('parsePriceInput', () => {
  it('parses NEAR prices with comma decimal', () => {
    expect(parsePriceInput('NEARUSDT', '2,019')).toBe(2.019);
    expect(parsePriceInput('NEARUSDT', '2.020')).toBe(2.02);
  });

  it('does not turn NEAR 2,019 into 2019', () => {
    expect(parseLocalizedNumber('2,019')).toBe(2.019);
    expect(parseLocalizedNumber('2,019')).not.toBe(2019);
  });

  it('parses BTC thousands', () => {
    expect(parsePriceInput('BTCUSDT', '65,000.50')).toBe(65000.5);
  });
});
