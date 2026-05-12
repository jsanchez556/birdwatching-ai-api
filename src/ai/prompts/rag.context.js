export function formatScore(score) {
  return Number.isFinite(score) ? Number(score.toFixed(4)) : 0;
}

export function formatRetrievedContext(documents) {
  return documents
    .map((document, index) => [
      `${index + 1}. ${document.name}`,
      `Similarity score: ${formatScore(document.score)}`,
      `Locations: ${document.locations || 'Unknown'}`,
      `Description: ${document.description}`,
    ].join('\n'))
    .join('\n\n');
}

export function createRagContextMessage(documents) {
  return {
    role: 'system',
    content: [
      'Use this retrieved Costa Rica bird knowledge when it is relevant to the user question.',
      'Do not claim the context contains information that is not present.',
      '',
      formatRetrievedContext(documents),
    ].join('\n'),
  };
}

export function toKnowledgeSource(document) {
  return {
    name: document.name,
    location: document.locations || 'Unknown',
    similarityScore: formatScore(document.score),
  };
}
