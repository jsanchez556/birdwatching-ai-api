import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const mockIngestDocuments = jest.fn();
const mockPoolEnd = jest.fn();

await jest.unstable_mockModule('../src/ingestion/services/ingest.service.js', () => ({
  default: {
    ingestDocuments: mockIngestDocuments,
  },
}));

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    end: mockPoolEnd,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  assertSafeDataPath,
  ingestFiles,
  normalizeFileName,
  parseJson,
  readDocumentsFromFile,
} = await import('../src/ingestion/services/birdsIngest.service.js');

describe('enrichment ingestion helpers', () => {
  let dataDir;

  beforeEach(async () => {
    jest.clearAllMocks();
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'birdwatching-ingest-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('normalizes dataset names to JSON file names', () => {
    expect(normalizeFileName('birds')).toBe('birds.json');
    expect(normalizeFileName('birds.json')).toBe('birds.json');
  });

  it('rejects paths outside src/ai/enrichment/data', () => {
    expect(() => assertSafeDataPath('../secrets.json', dataDir))
      .toThrow('Refusing to read outside src/ai/enrichment/data');
  });

  it('rejects JSON shapes that are not normalized document arrays', () => {
    expect(() => parseJson('{"documents":[]}', 'wrapped.json'))
      .toThrow('Invalid ingestion dataset shape in wrapped.json');
  });

  it('reads JSON document arrays and calls ingestion for one file', async () => {
    await writeFile(path.join(dataDir, 'birds.json'), JSON.stringify([
      {
        externalId: 'bird-quetza1',
        name: 'Resplendent Quetzal',
        description: 'Cloud forest bird.',
      },
    ]));
    mockIngestDocuments.mockResolvedValue({
      documentCount: 1,
      chunkCount: 1,
      skippedCount: 0,
    });

    await expect(ingestFiles(['birds.json'], { dataDir })).resolves.toEqual([{
      fileName: 'birds.json',
      skipped: false,
      documentCount: 1,
      chunkCount: 1,
      skippedCount: 0,
    }]);

    expect(mockIngestDocuments).toHaveBeenCalledWith([
      {
        externalId: 'bird-quetza1',
        name: 'Resplendent Quetzal',
        description: 'Cloud forest bird.',
      },
    ], {
      force: false,
      source: 'birds.json',
    });
  });

  it('allows explicit dataset names without the json extension', async () => {
    await writeFile(path.join(dataDir, 'birds.json'), '[]');
    mockIngestDocuments.mockResolvedValue({
      documentCount: 0,
      chunkCount: 0,
      skippedCount: 0,
    });

    await expect(ingestFiles(['birds'], { dataDir })).resolves.toEqual([{
      fileName: 'birds.json',
      skipped: false,
      documentCount: 0,
      chunkCount: 0,
      skippedCount: 0,
    }]);

    expect(mockIngestDocuments).toHaveBeenCalledWith([], {
      force: false,
      source: 'birds.json',
    });
  });

  it('processes multiple supported files', async () => {
    await writeFile(path.join(dataDir, 'birds.json'), '[]');
    await writeFile(path.join(dataDir, 'tours.json'), '[]');
    mockIngestDocuments.mockResolvedValue({
      documentCount: 0,
      chunkCount: 0,
      skippedCount: 0,
    });

    await ingestFiles(['birds.json', 'tours.json'], { dataDir });

    expect(mockIngestDocuments).toHaveBeenCalledTimes(2);
  });

  it('reports unsupported files without calling ingestion', async () => {
    await expect(readDocumentsFromFile('notes.txt', { dataDir })).resolves.toEqual({
      fileName: 'notes.txt',
      skipped: true,
      reason: 'Unsupported file type: .txt',
      documents: [],
    });
  });
});
