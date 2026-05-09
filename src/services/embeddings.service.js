import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import openaiClient from '../ai/openai.client.js';
import logger from '../utils/logger.js';

const KNOWLEDGE_BASE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../db/data/birds.json'
);

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
    throw new Error('birds.json must contain an array or family-keyed object of documents');
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
    const documents = normalizeKnowledgeBase(JSON.parse(rawData));

    return documents.filter((document) => document?.name && document?.description);
  }

  resetCache() {
    this.embeddedDocuments = null;
    this.initializationPromise = null;
  }
}

export { documentToText, normalizeKnowledgeBase, normalizeLocations };
export default new EmbeddingsService();
