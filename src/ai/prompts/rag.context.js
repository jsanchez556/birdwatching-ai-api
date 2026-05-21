export function formatScore(score) {
  return Number.isFinite(score) ? Number(score.toFixed(4)) : 0;
}

export function formatRetrievedContext(documents) {
  return documents
    .map((document, index) => {
      const metadata = document.metadata || {};

      return [
        `${index + 1}. ${document.name}`,
        `Similarity score: ${formatScore(document.score)}`,
        `Common name: ${metadata.commonName || document.name || 'Unknown'}`,
        `Scientific name: ${metadata.scientificName || 'Unknown'}`,
        `Family: ${metadata.familyCommonName || document.category || 'Unknown'}`,
        `Locations: ${document.locations || 'Unknown'}`,
        `Description: ${document.description}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function createRagContextMessage(documents) {
  return {
    role: 'system',
    content: [
      'Use this retrieved Costa Rica bird knowledge when it is relevant to the user question.',
      'When the user asks about a bird by name, prefer matches in this order: common name, scientific name, family, then locations.',
      'When the user asks about a bird group or plural category, summarize several matching species from the retrieved context instead of treating the first match as the only answer.',
      'Do not treat a location name alone as proof that the bird species matches the user question when another retrieved bird has a stronger name match.',
      'Do not claim the context contains information that is not present.',
      '',
      formatRetrievedContext(documents),
    ].join('\n'),
  };
}

export function toKnowledgeSource(document) {
  const metadata = document.metadata || {};

  return {
    name: document.name,
    location: document.locations || 'Unknown',
    similarityScore: formatScore(document.score),
    ...(metadata.scientificName ? { scientificName: metadata.scientificName } : {}),
    ...(document.documentType ? { documentType: document.documentType } : {}),
  };
}
