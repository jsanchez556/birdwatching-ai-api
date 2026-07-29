import {
  formatCurrency,
  formatPercent,
  normalizePositiveNumber,
  parsePositiveInteger,
  parsePositiveNumber,
} from '../../src/utils/number.utils.js';

describe('number utilities', () => {
  it('parses positive integer configuration values with fallback', () => {
    expect(parsePositiveInteger('30', 10)).toBe(30);
    expect(parsePositiveInteger('0', 10)).toBe(10);
    expect(parsePositiveInteger('nope', 10)).toBe(10);
  });

  it('parses positive numeric configuration values with fallback', () => {
    expect(parsePositiveNumber('0.92', 0.5)).toBe(0.92);
    expect(parsePositiveNumber('-1', 0.5)).toBe(0.5);
  });

  it('normalizes positive numbers for metrics', () => {
    expect(normalizePositiveNumber(1.25)).toBe(1.25);
    expect(normalizePositiveNumber(null)).toBe(0);
  });

  it('formats cost optimization metrics', () => {
    expect(formatPercent(74, 100)).toBe('74%');
    expect(formatPercent(1, 0)).toBe('0%');
    expect(formatCurrency(23.42)).toBe('$23.42');
  });
});
