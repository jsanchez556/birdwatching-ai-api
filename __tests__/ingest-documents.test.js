import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const mockIngestDocuments = jest.fn();
const mockPoolEnd = jest.fn();

await jest.unstable_mockModule('../src/db/ingestion/ingestion.service.js', () => ({
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
  discoverSupportedFiles,
  parseArgs,
  parseMarkdown,
  readDocumentsFromFile,
  runIngestionCli,
} = await import('../scripts/ingest-documents.js');

describe('ingest-documents CLI helpers', () => {
  let dataDir;

  beforeEach(async () => {
    jest.clearAllMocks();
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'birdwatching-ingest-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('parses explicit files and default all-files mode', () => {
    expect(parseArgs(['birds.json', 'notes.md'])).toEqual({
      force: false,
      all: false,
      files: ['birds.json', 'notes.md'],
    });

    expect(parseArgs([])).toEqual({
      force: false,
      all: true,
      files: [],
    });

    expect(parseArgs(['--all', '--force'])).toEqual({
      force: true,
      all: true,
      files: [],
    });
  });

  it('rejects paths outside src/db/data', () => {
    expect(() => assertSafeDataPath('../secrets.json', dataDir))
      .toThrow('Refusing to read outside src/db/data');
  });

  it('discovers supported files in deterministic order', async () => {
    await writeFile(path.join(dataDir, 'z.md'), '# Z');
    await writeFile(path.join(dataDir, 'a.json'), '[]');
    await writeFile(path.join(dataDir, 'ignore.txt'), 'nope');

    await expect(discoverSupportedFiles(dataDir)).resolves.toEqual(['a.json', 'z.md']);
  });

  it('parses markdown into one document', () => {
    expect(parseMarkdown('# Bird Notes\n\nCloud forest context.', 'notes.md')).toEqual([{
      id: 'notes',
      title: 'Bird Notes',
      content: '# Bird Notes\n\nCloud forest context.',
      source: 'notes.md',
      documentType: 'markdown',
      metadata: {
        fileName: 'notes.md',
      },
    }]);
  });

  it('reads JSON document arrays and calls ingestion for one file', async () => {
    await writeFile(path.join(dataDir, 'birds.json'), JSON.stringify([
      {
        title: 'Resplendent Quetzal',
        content: 'Cloud forest bird.',
      },
    ]));
    mockIngestDocuments.mockResolvedValue({
      documentCount: 1,
      chunkCount: 1,
      skippedCount: 0,
    });

    await expect(runIngestionCli(['birds.json'], { dataDir })).resolves.toEqual([{
      fileName: 'birds.json',
      skipped: false,
      documentCount: 1,
      chunkCount: 1,
      skippedCount: 0,
    }]);

    expect(mockIngestDocuments).toHaveBeenCalledWith([
      {
        title: 'Resplendent Quetzal',
        content: 'Cloud forest bird.',
      },
    ], {
      force: false,
      source: 'birds.json',
      documentType: undefined,
    });
  });

  it('processes all supported files when no files are specified', async () => {
    await writeFile(path.join(dataDir, 'birds.json'), '[]');
    await writeFile(path.join(dataDir, 'notes.md'), '# Notes');
    mockIngestDocuments.mockResolvedValue({
      documentCount: 0,
      chunkCount: 0,
      skippedCount: 0,
    });

    await runIngestionCli([], { dataDir });

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
