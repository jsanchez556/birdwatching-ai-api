import HttpError from '../../utils/httpError.js';
import {
  calibrateCandidateConfidence,
  calibrateIdentificationResult,
  normalizeIdentificationStatus,
} from './calibration.js';
import { normalizeGeneratedCandidate } from './candidateGeneration.js';
import {
  getKnowledgeKeys,
  normalizeEnrichedCandidates,
} from './evidenceRetrieval.js';

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

function normalizeVerifiedCandidate(candidate = {}, { imageAnalysis } = {}) {
  return compactObject({
    ...normalizeGeneratedCandidate(candidate, { imageAnalysis }),
    ragSupport: normalizeStringList(candidate.ragSupport).slice(0, 8),
    contradictions: normalizeStringList(candidate.contradictions).slice(0, 8),
    missingEvidence: normalizeStringList(candidate.missingEvidence).slice(0, 8),
  });
}

function mergeVerifierCandidate(candidate = {}, fallbackCandidates = []) {
  const candidateKeys = getKnowledgeKeys(candidate);
  const fallback = fallbackCandidates.find((item) => (
    getKnowledgeKeys(item).some((key) => candidateKeys.includes(key))
  )) || {};
  const visualEvidence = normalizeStringList(candidate.visualEvidence);
  const missingEvidence = normalizeStringList(candidate.missingEvidence);
  return {
    ...fallback,
    ...candidate,
    commonName: normalizeText(candidate.commonName || candidate.species)
      || normalizeText(fallback.commonName || fallback.species),
    scientificName: normalizeText(candidate.scientificName) || normalizeText(fallback.scientificName),
    reasoning: normalizeText(candidate.reasoning) || normalizeText(fallback.reasoning),
    visualEvidence: visualEvidence.length ? visualEvidence : normalizeStringList(fallback.visualEvidence),
    possibleConfusions: normalizeStringList(candidate.possibleConfusions).length
      ? normalizeStringList(candidate.possibleConfusions)
      : normalizeStringList(fallback.possibleConfusions),
    missingEvidence: missingEvidence.length ? missingEvidence : normalizeStringList(fallback.missingEvidence),
  };
}

export function normalizeBirdVerification(rawVerification, {
  imageAnalysis,
  fallbackCandidates = [],
} = {}) {
  if (!rawVerification || typeof rawVerification !== 'object' || Array.isArray(rawVerification)) {
    throw new HttpError(502, 'Bird verification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }
  if (!Array.isArray(rawVerification.candidates) || rawVerification.candidates.length > 5) {
    throw new HttpError(502, 'Bird verification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }
  const verifierCandidates = rawVerification.candidates.length
    ? rawVerification.candidates
    : [rawVerification.bestMatch].filter(Boolean);
  const sourceCandidates = verifierCandidates.length ? verifierCandidates : fallbackCandidates;
  const candidates = sourceCandidates.map((candidate) => normalizeVerifiedCandidate(
    mergeVerifierCandidate(candidate, fallbackCandidates),
    { imageAnalysis }
  ));
  const calibrated = calibrateIdentificationResult(
    candidates,
    normalizeIdentificationStatus(rawVerification.status, candidates)
  );
  return {
    status: calibrated.status,
    bestMatch: calibrated.bestMatch,
    candidates: calibrated.candidates,
    notes: normalizeStringList(rawVerification.notes).slice(0, 8),
  };
}

function fallbackVisualEvidence(imageAnalysis = {}) {
  return [
    ...(imageAnalysis.fieldMarks || []),
    ...(imageAnalysis.dominantColors || imageAnalysis.colors || []).map((color) => `${color} plumage`),
    imageAnalysis.bill?.color || imageAnalysis.beak ? `${imageAnalysis.bill?.color || imageAnalysis.beak} bill` : '',
    imageAnalysis.head || imageAnalysis.headPattern,
    imageAnalysis.throat,
    imageAnalysis.upperparts,
    imageAnalysis.underparts || imageAnalysis.bellyColor,
    imageAnalysis.tail,
    imageAnalysis.wings || imageAnalysis.wingPattern,
    imageAnalysis.bodyShape || imageAnalysis.size,
    imageAnalysis.apparentGroup,
    imageAnalysis.habitatHint,
  ].map(normalizeText).filter(Boolean).slice(0, 8);
}

function normalizeFallbackCandidate(candidate = {}, imageAnalysis = {}) {
  const commonName = normalizeText(candidate.commonName || candidate.species || candidate.name);
  const confidence = calibrateCandidateConfidence(candidate.confidence, imageAnalysis);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !commonName || confidence === null) {
    return null;
  }
  const visualEvidence = normalizeStringList(candidate.visualEvidence);
  return compactObject({
    species: commonName,
    commonName,
    scientificName: normalizeText(candidate.scientificName),
    confidence,
    reasoning: normalizeText(candidate.reasoning)
      || 'Candidate kept from the image-identification step after verifier fallback calibration.',
    visualEvidence: visualEvidence.length ? visualEvidence.slice(0, 8) : fallbackVisualEvidence(imageAnalysis),
    possibleConfusions: normalizeStringList(candidate.possibleConfusions).slice(0, 6),
    ragSupport: normalizeStringList(candidate.ragSupport).slice(0, 8),
    contradictions: normalizeStringList(candidate.contradictions).slice(0, 8),
    missingEvidence: normalizeStringList(candidate.missingEvidence).slice(0, 8),
  });
}

export function buildFallbackVerification({ imageAnalysis, identification, birdKnowledge }) {
  const enrichedCandidates = normalizeEnrichedCandidates({
    candidates: identification.candidates,
    birdKnowledge,
  });
  const candidates = enrichedCandidates.map((candidate) => normalizeFallbackCandidate({
    ...candidate,
    ragSupport: candidate.description ? [candidate.description] : [],
    contradictions: [],
    missingEvidence: candidate.missingEvidence || [],
  }, imageAnalysis)).filter(Boolean);
  const calibrated = calibrateIdentificationResult(candidates, identification.status);
  return {
    status: calibrated.status,
    bestMatch: calibrated.bestMatch,
    candidates: calibrated.candidates,
    notes: ['Candidate verification used fallback confidence calibration because the verifier did not return a usable response.'],
  };
}
