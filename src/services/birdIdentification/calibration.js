const MAX_BIRD_CANDIDATES = 5;
const VALID_IDENTIFICATION_STATUSES = new Set(['identified', 'uncertain', 'unknown']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return confidence;
}

export function normalizeIdentificationStatus(value, candidates = []) {
  const status = normalizeText(value).toLowerCase();
  if (VALID_IDENTIFICATION_STATUSES.has(status)) return status;
  const bestConfidence = candidates[0]?.confidence;
  if (bestConfidence === undefined || bestConfidence < 0.4) return 'unknown';
  if (bestConfidence < 0.55) return 'uncertain';
  return 'identified';
}

export function calibrateIdentificationResult(candidates = [], requestedStatus) {
  const sortedCandidates = [...candidates]
    .sort((first, second) => (second.confidence || 0) - (first.confidence || 0))
    .slice(0, MAX_BIRD_CANDIDATES);
  const bestConfidence = sortedCandidates[0]?.confidence;

  if (bestConfidence === undefined || bestConfidence < 0.4) {
    return { status: 'unknown', candidates: sortedCandidates, bestMatch: null };
  }
  if (bestConfidence < 0.55) {
    return { status: 'uncertain', candidates: sortedCandidates, bestMatch: sortedCandidates[0] };
  }

  const normalizedStatus = requestedStatus === 'unknown'
    ? 'uncertain'
    : normalizeIdentificationStatus(requestedStatus, sortedCandidates);
  return { status: normalizedStatus, candidates: sortedCandidates, bestMatch: sortedCandidates[0] };
}

function shouldCapConfidenceForWeakImage(imageAnalysis = {}) {
  const qualityText = [
    imageAnalysis.imageQuality,
    imageAnalysis.head,
    imageAnalysis.underparts,
    imageAnalysis.upperparts,
    imageAnalysis.tail,
  ].map((value) => normalizeText(value).toLowerCase()).join(' ');
  return /blurry|blur|distant|obscured|hidden|cropped|backlit|overexposed|underexposed|poor|low[- ]?quality|ambiguous/.test(qualityText);
}

export function calibrateCandidateConfidence(value, imageAnalysis = {}) {
  const confidence = normalizeConfidence(value);
  if (confidence === null) return null;

  const imageConfidence = normalizeConfidence(imageAnalysis.confidence);
  let calibrated = confidence;
  if (imageConfidence !== null && imageConfidence < 0.4) calibrated = Math.min(calibrated, 0.39);
  else if (imageConfidence !== null && imageConfidence < 0.55) calibrated = Math.min(calibrated, 0.54);
  if (shouldCapConfidenceForWeakImage(imageAnalysis)) calibrated = Math.min(calibrated, 0.69);
  return Number(calibrated.toFixed(4));
}
