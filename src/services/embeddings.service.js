import logger from '../utils/logger.js';

function normalizeLocations(document) {
  const locations = document.locations || document.location || '';
  return Array.isArray(locations) ? locations.join(', ') : locations;
}

function documentToText(document) {
  return [
    `Name: ${document.name}`,
    `Family: ${document.family}`,
    `Locations: ${normalizeLocations(document)}`,
    `Description: ${document.description}`,
  ]
    .filter((line) => !line.endsWith(': undefined') && !line.endsWith(': '))
    .join('\n');
}

function normalizeKnowledgeBase(documents) {
  if (Array.isArray(documents)) {
    return documents;
  }

  if (!documents || typeof documents !== 'object') {
    throw new Error('Knowledge source must contain an array or grouped object of documents');
  }

  return Object.entries(documents).flatMap(([family, birds]) => {
    if (!Array.isArray(birds)) {
      logger.warn('Skipping invalid bird family entry', { family });
      return [];
    }

    return birds.map((bird) => ({
      ...bird,
      family,
    }));
  });
}

export {
  documentToText,
  normalizeKnowledgeBase,
  normalizeLocations,
};
export default {
  documentToText,
  normalizeKnowledgeBase,
  normalizeLocations,
};
