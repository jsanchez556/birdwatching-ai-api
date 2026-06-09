function cleanComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function areTextsSimilar(candidate, current, options = {}) {
  const threshold = options.threshold ?? 0.8;
  const normalizedCandidate = cleanComparableText(candidate);
  const normalizedCurrent = cleanComparableText(current);

  if (!normalizedCandidate || !normalizedCurrent) {
    return false;
  }

  if (
    normalizedCandidate === normalizedCurrent
    || normalizedCandidate.includes(normalizedCurrent)
    || normalizedCurrent.includes(normalizedCandidate)
  ) {
    return true;
  }

  const candidateTokens = new Set(normalizedCandidate.split(' '));
  const currentTokens = new Set(normalizedCurrent.split(' '));
  const sharedTokenCount = [...candidateTokens]
    .filter((token) => currentTokens.has(token)).length;
  const tokenUnionCount = new Set([...candidateTokens, ...currentTokens]).size;

  return tokenUnionCount > 0 && sharedTokenCount / tokenUnionCount >= threshold;
}

function normalizeTextExtract(value) {
  const normalized = String(value || '').trim();

  return normalized || null;
}

export {
  areTextsSimilar,
  cleanComparableText,
  normalizeTextExtract,
};
