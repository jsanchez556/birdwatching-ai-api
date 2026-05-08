function normalizeVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    return [];
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value ** 2, 0)
  );

  if (magnitude === 0) {
    return vector.map(() => 0);
  }

  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(leftVector, rightVector) {
  if (!Array.isArray(leftVector) || !Array.isArray(rightVector)) {
    return 0;
  }

  if (leftVector.length === 0 || leftVector.length !== rightVector.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < leftVector.length; index += 1) {
    dotProduct += leftVector[index] * rightVector[index];
    leftMagnitude += leftVector[index] ** 2;
    rightMagnitude += rightVector[index] ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

class VectorSearchService {
  search(queryEmbedding, documents, topK = 3) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    const normalizedQueryEmbedding = normalizeVector(queryEmbedding);

    return documents
      .map((document) => ({
        ...document,
        embedding: normalizeVector(document.embedding),
      }))
      .map((document) => ({
        ...document,
        score: cosineSimilarity(normalizedQueryEmbedding, document.embedding),
      }))
      .filter((document) => document.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}

export { cosineSimilarity, normalizeVector };
export default new VectorSearchService();
