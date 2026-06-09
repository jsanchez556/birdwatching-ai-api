import birdIdentificationAgent, {
  BIRD_IDENTIFICATION_PROMPT_VERSION,
  BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
} from '../ai/agents/birdIdentification.agent.js';
import birdImageAnalysisService from './birdImageAnalysis.service.js';
import birdIdentificationImageStorage from './birdIdentificationImageStorage.service.js';
import ragService from './rag.service.js';
import birdIdentificationQueries from '../db/queries/birdIdentification.queries.js';
import env from '../config/env.js';
import {
  traceBirdIdentificationFinalResponse,
  traceBirdIdentificationPipeline,
  traceBirdIdentificationRagRetrieval,
  traceImageInput,
} from '../tracing/aiTracing.middleware.js';
import HttpError from '../utils/httpError.js';
import logger from '../utils/logger.js';

const MAX_BIRD_CANDIDATES = 5;
const RAG_TOP_K = MAX_BIRD_CANDIDATES;
const AMBIGUOUS_ORANGE_BEAK_NOTE = 'orange/yellow ambiguity: consider yellow-billed species when other visible traits support them';
const VALID_IDENTIFICATION_STATUSES = new Set(['identified', 'uncertain', 'unknown']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(normalizeText)
    .filter(Boolean);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => hasValue(entryValue))
  );
}

function normalizeUserId(userId) {
  if (userId === undefined || userId === null || userId === '') {
    return null;
  }

  const normalized = Number(userId);

  return Number.isFinite(normalized) ? normalized : null;
}

function parseProviderJson(response) {
  const rawContent = response.choices?.[0]?.message?.content;

  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new HttpError(502, 'Bird identification provider returned an empty response.', {
      code: 'provider_malformed_response',
    });
  }

  try {
    return JSON.parse(rawContent);
  } catch (error) {
    throw new HttpError(502, 'Bird identification provider returned invalid JSON.', {
      code: 'provider_malformed_response',
    });
  }
}

function normalizeKnowledgeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getKnowledgeKey(item = {}) {
  return normalizeKnowledgeKey(
    item.scientificName
    || item.commonName
    || item.name
    || item.speciesCode
  );
}

function getKnowledgeKeys(item = {}) {
  return [
    item.scientificName,
    item.commonName,
    item.name,
    item.species,
    item.speciesCode,
  ].map(normalizeKnowledgeKey).filter(Boolean);
}

function findExistingKnowledgeKey(entries, item = {}) {
  return getKnowledgeKeys(item).find((key) => entries.has(key));
}

function normalizeSourceKnowledge(source = {}) {
  const commonName = source.commonName || source.name;

  return compactObject({
    commonName,
    scientificName: source.scientificName,
    location: source.location,
    similarityScore: source.similarityScore,
    documentType: source.documentType,
  });
}

function normalizeBirdMatchKnowledge(match = {}) {
  return compactObject({
    speciesCode: match.speciesCode,
    commonName: match.commonName || match.name,
    scientificName: match.scientificName,
    family: match.family,
    description: match.description,
    location: match.location || match.locations,
    lastObservation: match.lastObservation,
    media: match.media,
  });
}

function mergeKnowledgeItems(existing = {}, incoming = {}) {
  return compactObject({
    ...existing,
    ...incoming,
    similarityScore: existing.similarityScore ?? incoming.similarityScore,
    documentType: existing.documentType ?? incoming.documentType,
  });
}

function normalizeRagTrace(ragTrace = {}) {
  return compactObject({
    retrievedChunkCount: ragTrace.retrievedChunkCount,
    sourceCount: ragTrace.sourceCount,
    originalMessageCount: ragTrace.originalMessageCount,
    groundedMessageCount: ragTrace.groundedMessageCount,
    contextMessageLength: ragTrace.contextMessageLength,
  });
}

function normalizeBirdKnowledge({ sources = [], birdMatches = [] } = {}) {
  const entries = new Map();

  for (const source of sources) {
    const item = normalizeSourceKnowledge(source);
    const key = getKnowledgeKey(item);

    if (!key) {
      continue;
    }

    entries.set(key, mergeKnowledgeItems(entries.get(key), item));
  }

  for (const match of birdMatches) {
    const item = normalizeBirdMatchKnowledge(match);
    const key = getKnowledgeKey(item);

    if (!key) {
      continue;
    }

    entries.set(key, mergeKnowledgeItems(entries.get(key), item));
  }

  return [...entries.values()];
}

function normalizeCandidateKnowledge(candidate = {}) {
  const commonName = normalizeText(candidate.commonName || candidate.species);

  return compactObject({
    species: commonName,
    commonName,
    scientificName: normalizeText(candidate.scientificName, ''),
    confidence: candidate.confidence,
    reasoning: candidate.reasoning,
    visualEvidence: candidate.visualEvidence,
    ragSupport: candidate.ragSupport,
    contradictions: candidate.contradictions,
    missingEvidence: candidate.missingEvidence,
    possibleConfusions: candidate.possibleConfusions,
  });
}

function normalizePrediction(candidate = {}) {
  return normalizeText(candidate.commonName || candidate.species);
}

function normalizeConfidence(value) {
  const confidence = Number(value);

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }

  return confidence;
}

function normalizeEnrichedCandidates({ candidates = [], birdKnowledge = [] } = {}) {
  const entries = new Map();

  for (const candidate of candidates) {
    const item = normalizeCandidateKnowledge(candidate);
    const key = getKnowledgeKey(item);

    if (!key) {
      continue;
    }

    entries.set(key, mergeKnowledgeItems(entries.get(key), item));
  }

  for (const knowledge of birdKnowledge) {
    const key = findExistingKnowledgeKey(entries, knowledge) || getKnowledgeKey(knowledge);

    if (!key) {
      continue;
    }

    entries.set(key, mergeKnowledgeItems(entries.get(key), knowledge));
  }

  return [...entries.values()].slice(0, MAX_BIRD_CANDIDATES);
}

function buildVisibleTraitEntries(imageAnalysis = {}) {
  const dominantColors = imageAnalysis.dominantColors || imageAnalysis.colors;
  const billColor = imageAnalysis.bill?.color || imageAnalysis.beak;

  return [
    dominantColors?.length ? `colors: ${dominantColors.join(', ')}` : '',
    imageAnalysis.fieldMarks?.length ? `field marks: ${imageAnalysis.fieldMarks.join(', ')}` : '',
    billColor ? `beak: ${billColor}` : '',
    imageAnalysis.bill?.shape ? `bill shape: ${imageAnalysis.bill.shape}` : '',
    imageAnalysis.bill?.length ? `bill length: ${imageAnalysis.bill.length}` : '',
    imageAnalysis.size ? `size: ${imageAnalysis.size}` : '',
    imageAnalysis.apparentGroup ? `apparent group: ${imageAnalysis.apparentGroup}` : '',
    imageAnalysis.bodyShape ? `body shape: ${imageAnalysis.bodyShape}` : '',
    imageAnalysis.head ? `head: ${imageAnalysis.head}` : '',
    imageAnalysis.throat ? `throat: ${imageAnalysis.throat}` : '',
    imageAnalysis.upperparts ? `upperparts: ${imageAnalysis.upperparts}` : '',
    imageAnalysis.underparts ? `underparts: ${imageAnalysis.underparts}` : '',
    imageAnalysis.tail ? `tail: ${imageAnalysis.tail}` : '',
    (imageAnalysis.wings || imageAnalysis.wingPattern) ? `wing pattern: ${imageAnalysis.wings || imageAnalysis.wingPattern}` : '',
    imageAnalysis.headPattern ? `head pattern: ${imageAnalysis.headPattern}` : '',
    imageAnalysis.bellyColor ? `belly color: ${imageAnalysis.bellyColor}` : '',
    imageAnalysis.imageQuality ? `image quality: ${imageAnalysis.imageQuality}` : '',
    imageAnalysis.habitatHint ? `habitat hint: ${imageAnalysis.habitatHint}` : '',
    imageAnalysis.beakColorInterpretation ? `beak color interpretation: ${imageAnalysis.beakColorInterpretation}` : '',
  ].filter(Boolean);
}

function buildBirdKnowledgeQuery({ imageAnalysis, candidates = [] }) {
  const candidateText = candidates
    .flatMap((candidate) => [
      candidate.commonName || candidate.species,
      candidate.scientificName,
      ...(Array.isArray(candidate.possibleConfusions) ? candidate.possibleConfusions : []),
    ])
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(', ');
  const traitText = buildVisibleTraitEntries(imageAnalysis).join('; ');

  return [
    'Costa Rica bird identification knowledge',
    candidateText ? `likely birds: ${candidateText}` : '',
    traitText ? `visible traits: ${traitText}` : '',
  ].filter(Boolean).join('. ');
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

function buildIdentificationImageAnalysis(imageAnalysis) {
  const summary = summarizeImageAnalysis(imageAnalysis);
  const beak = normalizeText(summary.bill?.color || summary.beak).toLowerCase();

  if (beak === 'orange' || beak === 'yellow-orange') {
    return {
      ...summary,
      beakColorInterpretation: AMBIGUOUS_ORANGE_BEAK_NOTE,
    };
  }

  return summary;
}

function buildEnrichedSummary({ status, imageAnalysis, candidates = [], birdMatches = [], sources = [] }) {
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

async function retrieveBirdKnowledge({ imageAnalysis, identification, metadata }) {
  const query = buildBirdKnowledgeQuery({
    imageAnalysis,
    candidates: identification.candidates,
  });

  return traceBirdIdentificationRagRetrieval('bird_identification_rag_retrieval', {
    ...metadata,
    queryLength: query.length,
    candidateCount: identification.candidates?.length || 0,
    topK: RAG_TOP_K,
    filters: {
      documentType: 'bird_profile',
    },
  }, async () => retrieveBirdKnowledgeUntraced({ query, metadata }));
}

async function retrieveBirdKnowledgeUntraced({ query, metadata }) {
  let context;

  try {
    context = await ragService.buildContext([
      {
        role: 'system',
        content: 'Bird image identification enrichment.',
      },
      {
        role: 'user',
        content: query,
      },
    ], query, {
      ...metadata,
      topK: RAG_TOP_K,
      filters: {
        documentType: 'bird_profile',
      },
    });
  } catch (error) {
    logger.warn('Failed to enrich bird identification with RAG; continuing without it', {
      event: 'bird_identification_rag_failed',
      errorName: error.name,
      errorCode: error.code,
      status: error.status,
    });

    context = {
      sources: [],
      birdMatches: [],
      ragTrace: {
        retrievedChunkCount: 0,
        sourceCount: 0,
        originalMessageCount: 2,
        groundedMessageCount: 2,
        contextMessageLength: 0,
      },
    };
  }

  return {
    query,
    sources: context.sources,
    birdMatches: context.birdMatches,
    ragTrace: context.ragTrace,
  };
}

async function traceImageInputBoundary({ imageUrl, metadata = {}, userId }) {
  return traceImageInput('bird_identification_image_input', {
    ...metadata,
    hasImageUrl: Boolean(imageUrl),
    imageUrlLength: typeof imageUrl === 'string' ? imageUrl.length : 0,
    userIdPresent: userId !== undefined && userId !== null,
  }, async () => ({
    hasImageUrl: Boolean(imageUrl),
    imageUrlLength: typeof imageUrl === 'string' ? imageUrl.length : 0,
    userIdPresent: userId !== undefined && userId !== null,
  }));
}

async function buildFinalIdentificationResponse({
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
  const calibratedFinal = enforceConfidenceStatus(candidates, verifiedResult.status);
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
    notes: [
      ...(identification.notes || []),
      ...(verifiedResult.notes || []),
    ],
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

async function recordBirdIdentificationHistory({ userId, imageUrl, candidates = [] }) {
  const normalizedUserId = normalizeUserId(userId);

  if (normalizedUserId === null) {
    return null;
  }

  const topCandidate = candidates[0];
  const prediction = normalizePrediction(topCandidate);

  if (!prediction) {
    return null;
  }

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

function normalizeStatus(value, candidates = []) {
  const status = normalizeText(value, '').toLowerCase();

  if (VALID_IDENTIFICATION_STATUSES.has(status)) {
    return status;
  }

  const bestConfidence = candidates[0]?.confidence;

  if (bestConfidence === undefined) {
    return 'unknown';
  }

  if (bestConfidence < 0.4) {
    return 'unknown';
  }

  if (bestConfidence < 0.55) {
    return 'uncertain';
  }

  return 'identified';
}

function enforceConfidenceStatus(candidates = [], requestedStatus) {
  const sortedCandidates = [...candidates]
    .sort((first, second) => (second.confidence || 0) - (first.confidence || 0))
    .slice(0, MAX_BIRD_CANDIDATES);
  const bestConfidence = sortedCandidates[0]?.confidence;

  if (bestConfidence === undefined || bestConfidence < 0.4) {
    return {
      status: 'unknown',
      candidates: sortedCandidates,
      bestMatch: null,
    };
  }

  if (bestConfidence < 0.55) {
    return {
      status: 'uncertain',
      candidates: sortedCandidates,
      bestMatch: sortedCandidates[0],
    };
  }

  const normalizedStatus = requestedStatus === 'unknown' ? 'uncertain' : normalizeStatus(requestedStatus, sortedCandidates);

  return {
    status: normalizedStatus,
    candidates: sortedCandidates,
    bestMatch: sortedCandidates[0],
  };
}

function shouldCapConfidenceForWeakImage(imageAnalysis = {}) {
  const qualityText = [
    imageAnalysis.imageQuality,
    imageAnalysis.head,
    imageAnalysis.underparts,
    imageAnalysis.upperparts,
    imageAnalysis.tail,
  ].map((value) => normalizeText(value, '').toLowerCase()).join(' ');

  return /blurry|blur|distant|obscured|hidden|cropped|backlit|overexposed|underexposed|poor|low[- ]?quality|ambiguous/.test(qualityText);
}

function calibrateConfidence(value, imageAnalysis = {}) {
  const confidence = normalizeConfidence(value);

  if (confidence === null) {
    return null;
  }

  const imageConfidence = normalizeConfidence(imageAnalysis.confidence);
  let calibrated = confidence;

  if (imageConfidence !== null && imageConfidence < 0.4) {
    calibrated = Math.min(calibrated, 0.39);
  } else if (imageConfidence !== null && imageConfidence < 0.55) {
    calibrated = Math.min(calibrated, 0.54);
  }

  if (shouldCapConfidenceForWeakImage(imageAnalysis)) {
    calibrated = Math.min(calibrated, 0.69);
  }

  return Number(calibrated.toFixed(4));
}

function normalizeGeneratedCandidate(candidate = {}, { imageAnalysis } = {}) {
  const commonName = normalizeText(candidate.commonName || candidate.species);
  const confidence = calibrateConfidence(candidate.confidence, imageAnalysis);
  const reasoning = normalizeText(candidate.reasoning, '');
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
    throw new HttpError(502, 'Bird identification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  return compactObject({
    species: commonName,
    commonName,
    scientificName: normalizeText(candidate.scientificName, ''),
    confidence,
    reasoning,
    visualEvidence,
    possibleConfusions: normalizeStringList(candidate.possibleConfusions).slice(0, 6),
    missingEvidence: normalizeStringList(candidate.missingEvidence).slice(0, 8),
  });
}

function normalizeVerifiedCandidate(candidate = {}, { imageAnalysis } = {}) {
  const generatedCandidate = normalizeGeneratedCandidate(candidate, { imageAnalysis });

  return compactObject({
    ...generatedCandidate,
    ragSupport: normalizeStringList(candidate.ragSupport).slice(0, 8),
    contradictions: normalizeStringList(candidate.contradictions).slice(0, 8),
    missingEvidence: normalizeStringList(candidate.missingEvidence).slice(0, 8),
  });
}

export function normalizeBirdIdentification(rawIdentification) {
  if (!rawIdentification || typeof rawIdentification !== 'object' || Array.isArray(rawIdentification)) {
    throw new HttpError(502, 'Bird identification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  if (!Array.isArray(rawIdentification.candidates) || rawIdentification.candidates.length > MAX_BIRD_CANDIDATES) {
    throw new HttpError(502, 'Bird identification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  const candidates = rawIdentification.candidates.map((candidate) => normalizeGeneratedCandidate(candidate, {
    imageAnalysis: rawIdentification.imageAnalysis,
  }));

  if (candidates.length === 0 && normalizeText(rawIdentification.status, '').toLowerCase() !== 'unknown') {
    throw new HttpError(502, 'Bird identification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  const calibrated = enforceConfidenceStatus(candidates, normalizeStatus(rawIdentification.status, candidates));

  return {
    status: calibrated.status,
    candidates: calibrated.candidates,
    notes: normalizeStringList(rawIdentification.notes).slice(0, 6),
  };
}

export function normalizeBirdVerification(rawVerification, { imageAnalysis, fallbackCandidates = [] } = {}) {
  if (!rawVerification || typeof rawVerification !== 'object' || Array.isArray(rawVerification)) {
    throw new HttpError(502, 'Bird verification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  if (!Array.isArray(rawVerification.candidates) || rawVerification.candidates.length > MAX_BIRD_CANDIDATES) {
    throw new HttpError(502, 'Bird verification provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  const sourceCandidates = rawVerification.candidates.length ? rawVerification.candidates : fallbackCandidates;
  const candidates = sourceCandidates.map((candidate) => normalizeVerifiedCandidate(candidate, { imageAnalysis }));
  const calibrated = enforceConfidenceStatus(candidates, normalizeStatus(rawVerification.status, candidates));

  return {
    status: calibrated.status,
    bestMatch: calibrated.bestMatch,
    candidates: calibrated.candidates,
    notes: normalizeStringList(rawVerification.notes).slice(0, 8),
  };
}

function buildFallbackVerification({ imageAnalysis, identification, birdKnowledge }) {
  const enrichedCandidates = normalizeEnrichedCandidates({
    candidates: identification.candidates,
    birdKnowledge,
  });
  const candidates = enrichedCandidates.map((candidate) => normalizeVerifiedCandidate({
    ...candidate,
    ragSupport: candidate.description ? [candidate.description] : [],
    contradictions: [],
    missingEvidence: candidate.missingEvidence || [],
  }, { imageAnalysis }));
  const calibrated = enforceConfidenceStatus(candidates, identification.status);

  return {
    status: calibrated.status,
    bestMatch: calibrated.bestMatch,
    candidates: calibrated.candidates,
    notes: ['Candidate verification used fallback confidence calibration because the verifier did not return a usable response.'],
  };
}

class BirdIdentificationService {
  async identifyFromInput({ imageUrl, imageUpload, metadata = {}, userId }) {
    if (imageUpload?.buffer?.length) {
      const storedImage = await birdIdentificationImageStorage.uploadIdentificationImage({
        imageUpload,
        userId,
      });

      return this.identifyFromImage({
        imageUrl: storedImage.imageUrl,
        metadata: {
          ...metadata,
          imageUploadKey: storedImage.key,
          imageUploadMimeType: imageUpload.mimeType,
          imageUploadBytes: imageUpload.buffer.length,
        },
        userId,
      });
    }

    return this.identifyFromImage({ imageUrl, metadata, userId });
  }

  async identify({ imageAnalysis, imageUrl, metadata = {} }) {
    const response = await birdIdentificationAgent.identify({
      imageAnalysis,
      imageUrl,
      metadata,
    });
    const identification = normalizeBirdIdentification({
      ...parseProviderJson(response),
      imageAnalysis,
    });

    logger.info('Bird identification finished', {
      event: 'bird_identification',
      model: response.model || env.openAiModel,
      requestId: response.id,
      promptVersion: BIRD_IDENTIFICATION_PROMPT_VERSION,
      candidateCount: identification.candidates.length,
      topConfidence: identification.candidates[0]?.confidence,
      status: identification.status,
    });

    return {
      ...identification,
      promptVersion: BIRD_IDENTIFICATION_PROMPT_VERSION,
      model: response.model || env.openAiModel,
      providerRequestId: response.id,
    };
  }

  async verifyAndRerankBirdCandidates({ imageAnalysis, candidates, retrievedProfiles, metadata = {} }) {
    try {
      const response = await birdIdentificationAgent.verifyAndRerank({
        imageAnalysis,
        candidates,
        retrievedProfiles,
        metadata,
      });
      const verification = normalizeBirdVerification(parseProviderJson(response), {
        imageAnalysis,
        fallbackCandidates: candidates,
      });

      logger.info('Bird identification verification finished', {
        event: 'bird_identification_verification',
        model: response.model || env.openAiModel,
        requestId: response.id,
        promptVersion: BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
        candidateCount: verification.candidates.length,
        topConfidence: verification.bestMatch?.confidence,
        status: verification.status,
      });

      return {
        ...verification,
        promptVersion: BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
        model: response.model || env.openAiModel,
        providerRequestId: response.id,
      };
    } catch (error) {
      logger.warn('Bird identification verification failed; using calibrated fallback', {
        event: 'bird_identification_verification_failed',
        errorName: error.name,
        errorCode: error.code,
        status: error.status,
      });

      return buildFallbackVerification({
        imageAnalysis,
        identification: {
          candidates,
          status: enforceConfidenceStatus(candidates, 'identified').status,
        },
        birdKnowledge: retrievedProfiles,
      });
    }
  }

  async identifyFromImage({ imageUrl, metadata = {}, userId }) {
    return traceBirdIdentificationPipeline('bird_identification_multimodal_pipeline', {
      ...metadata,
      hasImageUrl: Boolean(imageUrl),
      imageUrlLength: typeof imageUrl === 'string' ? imageUrl.length : 0,
      userIdPresent: userId !== undefined && userId !== null,
    }, (trace) => this.identifyFromImageUntraced({
      imageUrl,
      userId,
      metadata: {
        ...metadata,
        parentTraceId: trace.id,
      },
    }));
  }

  async identifyFromImageUntraced({ imageUrl, metadata = {}, userId }) {
    await traceImageInputBoundary({ imageUrl, metadata, userId });

    const imageAnalysis = await birdImageAnalysisService.analyze({
      imageUrl,
      metadata,
    });
    const identificationImageAnalysis = buildIdentificationImageAnalysis(imageAnalysis);
    const identification = await this.identify({
      imageAnalysis: identificationImageAnalysis,
      imageUrl,
      metadata,
    });
    const birdKnowledge = await retrieveBirdKnowledge({
      imageAnalysis: identificationImageAnalysis,
      identification,
      metadata,
    });
    const normalizedBirdKnowledge = normalizeBirdKnowledge(birdKnowledge);
    const verification = await this.verifyAndRerankBirdCandidates({
      imageAnalysis: identificationImageAnalysis,
      candidates: identification.candidates,
      retrievedProfiles: normalizedBirdKnowledge,
      metadata,
    });

    return traceBirdIdentificationFinalResponse('bird_identification_final_response', {
      ...metadata,
      model: verification.model || identification.model,
      candidateCount: verification.candidates?.length || 0,
      topCandidate: verification.bestMatch?.commonName || verification.candidates?.[0]?.commonName,
      topConfidence: verification.bestMatch?.confidence || verification.candidates?.[0]?.confidence,
      retrievedChunkCount: birdKnowledge.ragTrace?.retrievedChunkCount,
      sourceCount: birdKnowledge.sources?.length || 0,
      promptVersions: {
        birdImageAnalysis: imageAnalysis.promptVersion,
        birdIdentification: identification.promptVersion,
        birdVerification: verification.promptVersion,
      },
    }, () => buildFinalIdentificationResponse({
      imageAnalysis,
      identification,
      verification,
      birdKnowledge,
      imageUrl,
      metadata,
      userId,
    }));
  }
}

export {
  buildBirdKnowledgeQuery,
  buildEnrichedSummary,
  buildIdentificationImageAnalysis,
  normalizeBirdKnowledge,
  normalizeEnrichedCandidates,
  normalizeConfidence,
  normalizePrediction,
  normalizeRagTrace,
  normalizeUserId,
  recordBirdIdentificationHistory,
};
export default new BirdIdentificationService();
