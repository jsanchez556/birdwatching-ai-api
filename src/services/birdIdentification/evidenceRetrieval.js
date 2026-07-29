import ragService from '../rag.service.js';
import { traceBirdIdentificationRagRetrieval } from '../../tracing/aiTracing.middleware.js';
import logger from '../../utils/logger.js';

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

function normalizeKnowledgeKey(value) {
  return normalizeText(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getKnowledgeKey(item = {}) {
  return normalizeKnowledgeKey(
    item.scientificName || item.commonName || item.name || item.speciesCode
  );
}

export function getKnowledgeKeys(item = {}) {
  return [
    item.scientificName,
    item.commonName,
    item.name,
    item.species,
    item.speciesCode,
  ].map(normalizeKnowledgeKey).filter(Boolean);
}

function mergeKnowledgeItems(existing = {}, incoming = {}) {
  return compactObject({
    ...existing,
    ...incoming,
    similarityScore: existing.similarityScore ?? incoming.similarityScore,
    documentType: existing.documentType ?? incoming.documentType,
  });
}

export function normalizeBirdKnowledge({ sources = [], birdMatches = [] } = {}) {
  const entries = new Map();
  for (const source of sources) {
    const item = compactObject({
      commonName: source.commonName || source.name,
      scientificName: source.scientificName,
      location: source.location,
      similarityScore: source.similarityScore,
      documentType: source.documentType,
    });
    const key = getKnowledgeKey(item);
    if (key) entries.set(key, mergeKnowledgeItems(entries.get(key), item));
  }
  for (const match of birdMatches) {
    const item = compactObject({
      speciesCode: match.speciesCode,
      commonName: match.commonName || match.name,
      scientificName: match.scientificName,
      family: match.family,
      description: match.description,
      location: match.location || match.locations,
      lastObservation: match.lastObservation,
      media: match.media,
    });
    const key = getKnowledgeKey(item);
    if (key) entries.set(key, mergeKnowledgeItems(entries.get(key), item));
  }
  return [...entries.values()];
}

export function normalizeEnrichedCandidates({ candidates = [], birdKnowledge = [] } = {}) {
  const entries = new Map();
  for (const candidate of candidates) {
    const commonName = normalizeText(candidate.commonName || candidate.species);
    const item = compactObject({
      species: commonName,
      commonName,
      scientificName: normalizeText(candidate.scientificName),
      confidence: candidate.confidence,
      reasoning: candidate.reasoning,
      visualEvidence: candidate.visualEvidence,
      ragSupport: candidate.ragSupport,
      contradictions: candidate.contradictions,
      missingEvidence: candidate.missingEvidence,
      possibleConfusions: candidate.possibleConfusions,
    });
    const key = getKnowledgeKey(item);
    if (key) entries.set(key, mergeKnowledgeItems(entries.get(key), item));
  }
  for (const knowledge of birdKnowledge) {
    const key = getKnowledgeKeys(knowledge).find((candidateKey) => entries.has(candidateKey))
      || getKnowledgeKey(knowledge);
    if (key) entries.set(key, mergeKnowledgeItems(entries.get(key), knowledge));
  }
  return [...entries.values()].slice(0, MAX_BIRD_CANDIDATES);
}

export function buildVisibleTraitEntries(imageAnalysis = {}) {
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

export function buildBirdKnowledgeQuery({ imageAnalysis, candidates = [] }) {
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

async function retrieveUntraced({ query, metadata }) {
  try {
    const context = await ragService.buildContext([
      { role: 'system', content: 'Bird image identification enrichment.' },
      { role: 'user', content: query },
    ], query, {
      ...metadata,
      topK: MAX_BIRD_CANDIDATES,
      filters: { documentType: 'bird_profile' },
    });
    return {
      query,
      sources: context.sources,
      birdMatches: context.birdMatches,
      ragTrace: context.ragTrace,
    };
  } catch (error) {
    logger.warn('Failed to enrich bird identification with RAG; continuing without it', {
      event: 'bird_identification_rag_failed',
      errorName: error.name,
      errorCode: error.code,
      status: error.status,
    });
    return {
      query,
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
}

export async function retrieveBirdEvidence({ imageAnalysis, identification, metadata }) {
  const query = buildBirdKnowledgeQuery({ imageAnalysis, candidates: identification.candidates });
  return traceBirdIdentificationRagRetrieval('bird_identification_rag_retrieval', {
    ...metadata,
    queryLength: query.length,
    candidateCount: identification.candidates?.length || 0,
    topK: MAX_BIRD_CANDIDATES,
    filters: { documentType: 'bird_profile' },
  }, async () => retrieveUntraced({ query, metadata }));
}
