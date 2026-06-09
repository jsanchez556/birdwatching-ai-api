import logger from '../../../utils/logger.js';

function normalizeLocations(document) {
  const locations = document.locations || document.location || '';
  return Array.isArray(locations) ? locations.join(', ') : locations;
}

function compactLines(lines) {
  return lines
    .filter((line) => line && !line.endsWith(': undefined') && !line.endsWith(': '))
    .join('\n');
}

function formatObservation(observation) {
  if (!observation || typeof observation !== 'object') {
    return null;
  }

  const locations = Array.isArray(observation.locations)
    ? observation.locations.join(', ')
    : observation.locName || observation.location;
  const parts = [
    locations ? `location ${locations}` : null,
    observation.obsDt ? `date ${observation.obsDt}` : null,
    observation.howMany !== null && observation.howMany !== undefined
      ? `count ${observation.howMany}`
      : null,
  ].filter(Boolean);

  return parts.length ? parts.join(', ') : null;
}

function formatRecentObservationLocations(recentObservations) {
  if (!recentObservations || typeof recentObservations !== 'object') {
    return null;
  }

  const locations = Array.isArray(recentObservations.locations)
    ? recentObservations.locations
      .map((observation) => observation?.locName)
      .filter(Boolean)
    : [];

  return locations.length ? locations.join(', ') : null;
}

function formatMediaAvailability(media = {}) {
  if (!media || typeof media !== 'object') {
    return null;
  }

  const available = [
    media.photoUrl ? 'photo' : null,
    media.songUrl ? 'song recording' : null,
    media.sonogramUrl ? 'sonogram' : null,
  ].filter(Boolean);

  return available.length ? available.join(', ') : null;
}

function documentToText(document) {
  const metadata = document.metadata || {};
  const scientificName = document.scientificName || metadata.scientificName;
  const observation = formatObservation(document.lastObservation || metadata.lastObservation);
  const recentObservationLocations = formatRecentObservationLocations(metadata.recentObservations);
  const mediaAvailability = formatMediaAvailability(document.media || metadata.media);
  const description = document.description || metadata.description;

  return compactLines([
    `Name: ${document.name}`,
    scientificName ? `Scientific name: ${scientificName}` : null,
    `Family: ${document.family || metadata.familyCommonName}`,
    `Locations: ${normalizeLocations(document)}`,
    description ? `Description: ${description}` : null,
    observation ? `Recent observation: ${observation}` : null,
    recentObservationLocations ? `Recent observation locations: ${recentObservationLocations}` : null,
    mediaAvailability ? `Media available: ${mediaAvailability}` : null,
  ]);
}

function normalizeKnowledgeBase(documents) {
  if (Array.isArray(documents)) {
    return documents;
  }

  logger.warn('Skipping invalid normalized ingestion dataset', {
    receivedType: documents === null ? 'null' : typeof documents,
  });
  throw new Error('Knowledge source must contain an array of normalized ingestion documents');
}

export {
  documentToText,
  normalizeKnowledgeBase,
  normalizeLocations,
};
