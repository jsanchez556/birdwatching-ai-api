function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatPercent(numerator, denominator) {
  if (!denominator) {
    return '0%';
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}

export {
  formatCurrency,
  formatPercent,
  normalizePositiveNumber,
  parsePositiveInteger,
  parsePositiveNumber,
};
