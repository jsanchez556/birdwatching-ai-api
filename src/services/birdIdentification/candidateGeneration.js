import HttpError from '../../utils/httpError.js';
import {
  calibrateCandidateConfidence,
  calibrateIdentificationResult,
  normalizeIdentificationStatus,
} from './calibration.js';

const MAX_BIRD_CANDIDATES = 5;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(values) {
  return Array.isArray(values) ? values.map(normalizeText).filter(Boolean) : [];
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => (
      entryValue !== undefined && entryValue !== null && entryValue !== ''
    ))
  );
}

function malformed(message = 'Bird identification provider returned an invalid response.') {
  return new HttpError(502, message, { code: 'provider_malformed_response' });
}

export function parseBirdProviderJson(response) {
  const rawContent = response.choices?.[0]?.message?.content;
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    throw malformed('Bird identification provider returned an empty response.');
  }
  try {
    return JSON.parse(rawContent);
  } catch {
    throw malformed('Bird identification provider returned invalid JSON.');
  }
}

export function normalizeGeneratedCandidate(candidate = {}, { imageAnalysis } = {}) {
  const commonName = normalizeText(candidate.commonName || candidate.species);
  const confidence = calibrateCandidateConfidence(candidate.confidence, imageAnalysis);
  const reasoning = normalizeText(candidate.reasoning);
  const visualEvidence = normalizeStringList(candidate.visualEvidence).slice(0, 8);
  if (
    !candidate
    || typeof candidate !== 'object'
    || Array.isArray(candidate)
    || !commonName
    || confidence === null
    || !reasoning
    || visualEvidence.length === 0
  ) {
    throw malformed();
  }
  return compactObject({
    species: commonName,
    commonName,
    scientificName: normalizeText(candidate.scientificName),
    confidence,
    reasoning,
    visualEvidence,
    possibleConfusions: normalizeStringList(candidate.possibleConfusions).slice(0, 6),
    missingEvidence: normalizeStringList(candidate.missingEvidence).slice(0, 8),
  });
}

export function normalizeBirdIdentification(rawIdentification) {
  if (!rawIdentification || typeof rawIdentification !== 'object' || Array.isArray(rawIdentification)) {
    throw malformed();
  }
  if (!Array.isArray(rawIdentification.candidates) || rawIdentification.candidates.length > MAX_BIRD_CANDIDATES) {
    throw malformed();
  }
  const candidates = rawIdentification.candidates.map((candidate) => normalizeGeneratedCandidate(candidate, {
    imageAnalysis: rawIdentification.imageAnalysis,
  }));
  if (candidates.length === 0 && normalizeText(rawIdentification.status).toLowerCase() !== 'unknown') {
    throw malformed();
  }
  const calibrated = calibrateIdentificationResult(
    candidates,
    normalizeIdentificationStatus(rawIdentification.status, candidates)
  );
  return {
    status: calibrated.status,
    candidates: calibrated.candidates,
    notes: normalizeStringList(rawIdentification.notes).slice(0, 6),
  };
}
