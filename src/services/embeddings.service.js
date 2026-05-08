import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import openaiClient from '../ai/openai.client.js';
import logger from '../utils/logger.js';

const KNOWLEDGE_BASE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../birds.json'
);

function normalizeLocations(document) {
  const locations = document.locations || document.location || '';
  return Array.isArray(locations) ? locations.join(', ') : locations;
}

function documentToText(document) {
  return [
    `Name: ${document.name}`,
    `Locations: ${normalizeLocations(document)}`,
    `Description: ${document.description}`,
  ]
    .filter((line) => !line.endsWith(': undefined') && !line.endsWith(': '))
    .join('\n');
}

class EmbeddingsService {
  constructor() {
    this.embeddedDocuments = null;
    this.initializationPromise = null;
  }

  async searchSimilarDocuments() {
    if (this.embeddedDocuments) {
      return this.embeddedDocuments;
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this.loadAndEmbedKnowledgeBase();
    }

    this.embeddedDocuments = await this.initializationPromise;
    return this.embeddedDocuments;
  }

  async loadAndEmbedKnowledgeBase() {
    const documents = await this.loadKnowledgeBase();

    if (documents.length === 0) {
      logger.warn('Bird knowledge base is empty');
      return [];
    }

    const inputs = documents.map(documentToText);
    const embeddings = await openaiClient.generateEmbedding(inputs);

    const embeddedDocuments = documents.map((document, index) => ({
      id: document.id || document.name || `bird-${index + 1}`,
      ...document,
      locations: normalizeLocations(document),
      text: inputs[index],
      embedding: embeddings[index],
    }));

    logger.info('Bird knowledge base embedded', {
      documentCount: embeddedDocuments.length,
    });

    return embeddedDocuments;
  }

  async loadKnowledgeBase() {
    const rawData = await readFile(KNOWLEDGE_BASE_PATH, 'utf8');
    const documents = JSON.parse(rawData);

    if (!Array.isArray(documents)) {
      throw new Error('birds.json must contain an array of documents');
    }

    return documents.filter((document) => document?.name && document?.description);
  }

  resetCache() {
    this.embeddedDocuments = null;
    this.initializationPromise = null;
  }
}

export { documentToText, normalizeLocations };
export default new EmbeddingsService();
