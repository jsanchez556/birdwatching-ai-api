import { BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION } from '../../ai/agents/birdIdentification.agent.js';
import birdIdentificationQueries from '../../db/queries/birdIdentification.queries.js';
import logger from '../../utils/logger.js';
import {
  calibrateIdentificationResult,
  normalizeConfidence,
} from './calibration.js';
import {
  buildVisibleTraitEntries,
  normalizeBirdKnowledge,
  normalizeEnrichedCandidates,
} from './evidenceRetrieval.js';
import { buildFallbackVerification } from './reranking.js';

const AMBIGUOUS_ORANGE_BEAK_NOTE = 'orange/yellow ambiguity: consider yellow-billed species when other visible traits support them';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => (
      entryValue !== undefined && entryValue !== null && entryValue !== ''
    ))
  );
}

export function normalizeUserId(userId) {
  if (userId === undefined || userId === null || userId === '') return null;
  const normalized = Number(userId);
  return Number.isFinite(normalized) ? normalized : null;
}

export function normalizePrediction(candidate = {}) {
  return normalizeText(candidate.commonName || candidate.species);
}

export function normalizeRagTrace(ragTrace = {}) {
  return compactObject({
    retrievedChunkCount: ragTrace.retrievedChunkCount,
    sourceCount: ragTrace.sourceCount,
    originalMessageCount: ragTrace.originalMessageCount,
    groundedMessageCount: ragTrace.groundedMessageCount,
    contextMessageLength: ragTrace.contextMessageLength,
  });
}

function summarizeImageAnalysis(imageAnalysis) {
  const dominantColors = imageAnalysis.dominantColors || imageAnalysis.colors || [];
  const bill = imageAnalysis.bill || {
    color: imageAnalysis.beak || 'unknown',
    shape: 'unknown',
    length: 'unknown',
  };
  return {
    dominantColors,
    fieldMarks: imageAnalysis.fieldMarks || [],
    bill: {
      color: normalizeText(bill.color),
      shape: normalizeText(bill.shape),
      length: normalizeText(bill.length),
    },
    head: normalizeText(imageAnalysis.head || imageAnalysis.headPattern),
    throat: normalizeText(imageAnalysis.throat),
    underparts: normalizeText(imageAnalysis.underparts || imageAnalysis.bellyColor),
    upperparts: normalizeText(imageAnalysis.upperparts),
    wings: normalizeText(imageAnalysis.wings || imageAnalysis.wingPattern),
    tail: normalizeText(imageAnalysis.tail),
    legs: normalizeText(imageAnalysis.legs),
    bodyShape: normalizeText(imageAnalysis.bodyShape || imageAnalysis.size),
    apparentGroup: normalizeText(imageAnalysis.apparentGroup),
    habitatHint: normalizeText(imageAnalysis.habitatHint),
    imageQuality: normalizeText(imageAnalysis.imageQuality),
    confidence: imageAnalysis.confidence,
    colors: dominantColors.slice(0, 3),
    beak: normalizeText(bill.color),
    size: normalizeText(imageAnalysis.size || imageAnalysis.bodyShape),
    wingPattern: normalizeText(imageAnalysis.wingPattern || imageAnalysis.wings),
    headPattern: normalizeText(imageAnalysis.headPattern || imageAnalysis.head),
    bellyColor: normalizeText(imageAnalysis.bellyColor || imageAnalysis.underparts),
  };
}

export function buildIdentificationImageAnalysis(imageAnalysis) {
  const summary = summarizeImageAnalysis(imageAnalysis);
  const beak = normalizeText(summary.bill?.color || summary.beak).toLowerCase();
  return beak === 'orange' || beak === 'yellow-orange'
    ? { ...summary, beakColorInterpretation: AMBIGUOUS_ORANGE_BEAK_NOTE }
    : summary;
}

export function buildEnrichedSummary({
  status,
  imageAnalysis,
  candidates = [],
  birdMatches = [],
  sources = [],
}) {
  const topCandidate = candidates[0];
  const topMatch = birdMatches.find((match) => (
    match.commonName === (topCandidate?.commonName || topCandidate?.species)
    || match.scientificName === (topCandidate?.scientificName || topCandidate?.species)
  )) || birdMatches[0];
  const topName = topCandidate?.commonName || topCandidate?.species;
  const confidenceText = status === 'identified' && topCandidate?.confidence >= 0.7
    ? 'The image evidence points most strongly to'
    : 'The image evidence is uncertain, but the best current match is';
  const traitText = buildVisibleTraitEntries(imageAnalysis).join('; ');
  const knowledgeText = topMatch
    ? [
      topMatch.description,
      topMatch.locations ? `In Costa Rica, retrieved records mention ${topMatch.locations}.` : '',
    ].filter(Boolean).join(' ')
    : 'No matching bird profile was retrieved from the knowledge base for this image.';

  if (!topCandidate) {
    return 'The image was analyzed, but the visible evidence is not strong enough for a reliable bird identification.';
  }
  return [
    `${confidenceText} ${topName}.`,
    traitText ? `The visible traits considered were ${traitText}.` : '',
    topCandidate.contradictions?.length ? `Contradictions considered: ${topCandidate.contradictions.join('; ')}.` : '',
    knowledgeText,
    sources.length ? `Retrieved ${sources.length} knowledge source${sources.length === 1 ? '' : 's'} for grounding.` : '',
  ].filter(Boolean).join(' ');
}

export async function recordBirdIdentificationHistory({ userId, imageUrl, candidates = [] }) {
  const normalizedUserId = normalizeUserId(userId);
  if (normalizedUserId === null) return null;
  const topCandidate = candidates[0];
  const prediction = normalizePrediction(topCandidate);
  if (!prediction) return null;

  try {
    return await birdIdentificationQueries.createHistory({
      userId: normalizedUserId,
      imageUrl,
      prediction,
      confidence: normalizeConfidence(topCandidate.confidence),
    });
  } catch (error) {
    logger.warn('Failed to persist bird identification history', {
      event: 'bird_identification_history_persist_failed',
      userId: normalizedUserId,
      error: error.message,
    });
    return null;
  }
}

export async function assembleBirdIdentificationResponse({
  imageAnalysis,
  identification,
  verification,
  birdKnowledge,
  imageUrl,
  metadata,
  userId,
}) {
  const imageObservations = summarizeImageAnalysis(imageAnalysis);
  const normalizedBirdKnowledge = normalizeBirdKnowledge(birdKnowledge);
  const verifiedResult = verification || buildFallbackVerification({
    imageAnalysis: imageObservations,
    identification,
    birdKnowledge: normalizedBirdKnowledge,
  });
  const candidates = normalizeEnrichedCandidates({
    candidates: verifiedResult.candidates,
    birdKnowledge: normalizedBirdKnowledge,
  });
  const calibratedFinal = calibrateIdentificationResult(candidates, verifiedResult.status);
  const summary = buildEnrichedSummary({
    status: calibratedFinal.status,
    imageAnalysis: imageObservations,
    candidates: calibratedFinal.candidates,
    birdMatches: birdKnowledge.birdMatches,
    sources: birdKnowledge.sources,
  });
  await recordBirdIdentificationHistory({
    userId,
    imageUrl,
    candidates: calibratedFinal.status === 'identified' ? calibratedFinal.candidates : [],
  });

  return {
    status: calibratedFinal.status,
    bestMatch: calibratedFinal.bestMatch,
    summary,
    imageAnalysis: imageObservations,
    imageObservations,
    candidates: calibratedFinal.candidates,
    notes: [...(identification.notes || []), ...(verifiedResult.notes || [])],
    promptVersions: {
      birdImageAnalysis: imageAnalysis.promptVersion,
      birdIdentification: identification.promptVersion,
      birdVerification: verification?.promptVersion || BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
    },
    model: verification?.model || identification.model,
    providerRequestId: verification?.providerRequestId || identification.providerRequestId,
    ragTrace: normalizeRagTrace(birdKnowledge.ragTrace),
    debug: metadata.debug ? {
      rawCandidates: identification.candidates,
      retrievedProfiles: normalizedBirdKnowledge.map((profile) => compactObject({
        commonName: profile.commonName,
        scientificName: profile.scientificName,
        speciesCode: profile.speciesCode,
      })),
      verificationNotes: verifiedResult.notes || [],
    } : undefined,
  };
}
