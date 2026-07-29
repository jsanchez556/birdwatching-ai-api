import { normalizeRagQuery } from './queryNormalization.js';
import { compactObject } from './contextAssembly.js';

const DEFAULT_BIRD_MATCH_LIMIT = 6;
const FIELD_MATCH_WEIGHTS = {
  commonName: 500,
  scientificName: 400,
  family: 250,
  description: 150,
  location: 40,
  speciesCode: 10,
};
const QUESTION_STOP_WORDS = new Set([
  'about', 'bird', 'birds', 'can', 'could', 'find', 'for', 'from', 'give', 'i',
  'in', 'info', 'information', 'me', 'near', 'of', 'on', 'please', 'see',
  'show', 'tell', 'the', 'to', 'what', 'where', 'with',
]);

function singularizeToken(token) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

function tokenizeQuestion(question) {
  const normalized = normalizeRagQuery(question);
  if (!normalized) return [];

  return [...new Set(normalized
    .split(/\s+/)
    .map(singularizeToken)
    .filter((token) => token.length > 2)
    .filter((token) => !QUESTION_STOP_WORDS.has(token)))];
}

function scoreFieldMatch(fieldValue, queryText, queryTokens, weight) {
  if (!fieldValue) return 0;
  const fieldText = normalizeRagQuery(fieldValue);
  const fieldTokens = new Set(fieldText.split(/\s+/).filter(Boolean).map(singularizeToken));
  const exactPhraseScore = fieldText && queryText && fieldText.includes(queryText) ? weight : 0;
  const tokenScore = queryTokens.filter((token) => fieldTokens.has(token)).length * Math.round(weight / 4);
  return exactPhraseScore + tokenScore;
}

function normalizeBirdMedia(media = {}) {
  if (!media || typeof media !== 'object') return {};

  return compactObject({
    photoUrl: media.photoUrl,
    squarePhotoUrl: media.squarePhotoUrl,
    photoAttribution: media.photoAttribution,
    wikiTitle: media.wikiTitle,
    songUrl: media.songUrl,
    sonogramUrl: media.sonogramUrl,
    songLength: media.songLength,
    songAttributionHtml: media.songAttributionHtml,
  });
}

function scoreBirdMedia(media = {}) {
  const hasImage = Boolean(media?.photoUrl || media?.squarePhotoUrl);
  const hasSound = Boolean(media?.songUrl);
  if (hasImage && hasSound) return 4;
  if (hasImage) return 3;
  if (hasSound) return 2;
  return 1;
}

function getBirdIdentityKey(document = {}) {
  const metadata = document.metadata || {};
  return metadata.speciesCode || document.id || document.documentId || metadata.commonName || document.name;
}

function getBirdFamily(document = {}) {
  return document.metadata?.familyCommonName || document.category;
}

function scoreBirdMatch(document, question) {
  const metadata = document.metadata || {};
  const questionText = normalizeRagQuery(question);
  const questionTokens = tokenizeQuestion(question);

  if (!questionText || questionTokens.length === 0) {
    return {
      score: Number(document.score) || 0,
      identityScore: 0,
      hasIdentityMatch: false,
      mediaPriority: scoreBirdMedia(metadata.media),
    };
  }

  const identityScore = (
    scoreFieldMatch(metadata.commonName || document.name, questionText, questionTokens, FIELD_MATCH_WEIGHTS.commonName)
    + scoreFieldMatch(metadata.scientificName, questionText, questionTokens, FIELD_MATCH_WEIGHTS.scientificName)
    + scoreFieldMatch(getBirdFamily(document), questionText, questionTokens, FIELD_MATCH_WEIGHTS.family)
    + scoreFieldMatch(metadata.speciesCode, questionText, questionTokens, FIELD_MATCH_WEIGHTS.speciesCode)
  );
  const locations = document.locations === 'Unknown' ? '' : document.locations || metadata.locations;
  const contextualScore = (
    scoreFieldMatch(document.description || metadata.description, questionText, questionTokens, FIELD_MATCH_WEIGHTS.description)
    + scoreFieldMatch(locations, questionText, questionTokens, FIELD_MATCH_WEIGHTS.location)
  );

  return {
    score: identityScore + contextualScore + (Number(document.score) || 0),
    identityScore,
    hasIdentityMatch: identityScore > 0,
    mediaPriority: scoreBirdMedia(metadata.media),
  };
}

function normalizeBirdMatch(document) {
  if (document?.documentType !== 'bird_profile') return null;
  const metadata = document.metadata || {};
  const media = normalizeBirdMedia(metadata.media);
  const match = compactObject({
    speciesCode: metadata.speciesCode,
    commonName: metadata.commonName || document.name,
    scientificName: metadata.scientificName,
    family: metadata.familyCommonName || document.category,
    description: document.description,
    locations: document.locations === 'Unknown' ? undefined : document.locations,
    lastObservation: metadata.lastObservation,
    ...(Object.keys(media).length ? { media } : {}),
  });
  return Object.keys(match).length ? match : null;
}

export function getSupplementalBirdFamily(documents = [], question = '') {
  const familyCounts = new Map();
  for (const document of documents) {
    if (document?.documentType !== 'bird_profile') continue;
    const family = getBirdFamily(document);
    const matches = scoreFieldMatch(
      family,
      normalizeRagQuery(question),
      tokenizeQuestion(question),
      FIELD_MATCH_WEIGHTS.family
    ) > 0;
    if (!family || !matches) continue;
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }
  return [...familyCounts.entries()].sort((left, right) => right[1] - left[1]).at(0)?.[0];
}

export function mergeRetrievedDocuments(primaryDocuments = [], supplementalDocuments = []) {
  const merged = [];
  const seen = new Set();
  for (const document of [...primaryDocuments, ...supplementalDocuments]) {
    const key = getBirdIdentityKey(document);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(document);
  }
  return merged;
}

export function buildBirdMatches(documents = [], question = '', limit = DEFAULT_BIRD_MATCH_LIMIT) {
  const matches = [];
  const seen = new Set();
  const rankedDocuments = documents
    .filter((document) => document?.documentType === 'bird_profile')
    .map((document, index) => ({ document, index, ...scoreBirdMatch(document, question) }));
  const hasIdentityMatches = rankedDocuments.some((candidate) => candidate.hasIdentityMatch);

  rankedDocuments.sort((left, right) => (
    Number(right.hasIdentityMatch) - Number(left.hasIdentityMatch)
    || right.identityScore - left.identityScore
    || right.mediaPriority - left.mediaPriority
    || right.score - left.score
    || left.index - right.index
  ));

  for (const { document, hasIdentityMatch } of rankedDocuments) {
    if (hasIdentityMatches && !hasIdentityMatch) continue;
    const match = normalizeBirdMatch(document);
    if (!match) continue;
    const key = getBirdIdentityKey(document) || match.speciesCode || match.commonName;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    matches.push(match);
    if (matches.length >= limit) break;
  }
  return matches;
}

export { normalizeBirdMatch };
