import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
  },
}));

const {
  default: BirdsExportService,
} = await import('../src/ingestion/services/birdsIngest.service.js');
const {
  DAY_MS,
} = await import('../src/utils/constants.utils.js');
const {
  extensionFromXenoCantoAudio,
  buildXenoCantoAudioAssetName,
  buildXenoCantoSonogramAssetName,
  normalizeXenoCantoSourceUrl,
} = await import('../src/ingestion/utils/birdsIngest.utils.js');
const {
  normalizeLicense,
} = await import('../src/utils/license.utils.js');
const {
  parseArgs,
  runEnrichCli,
} = await import('../scripts/enrich.js');
const logger = (await import('../src/utils/logger.js')).default;

function createEBirdClientMock(overrides = {}) {
  return {
    getSpeciesList: jest.fn().mockResolvedValue(['higtin1', 'gretin1']),
    getTaxo: jest.fn().mockResolvedValue([
      {
        sciName: 'Nothocercus bonapartei',
        comName: 'Highland Tinamou',
        speciesCode: 'higtin1',
        familyComName: 'Tinamous',
        familySciName: 'Tinamidae',
      },
      {
        sciName: 'Tinamus major',
        comName: 'Great Tinamou',
        speciesCode: 'gretin1',
        familyComName: 'Tinamous',
        familySciName: 'Tinamidae',
      },
    ]),
    getRecentObservations: jest.fn().mockImplementation(async (_countryCode, speciesCode) => ([{
      speciesCode,
      comName: 'Mock Bird',
      sciName: 'Avis mockus',
      locId: 'L436229',
      locName: 'Arenal Observatory Lodge',
      obsDt: '2026-05-19 11:37',
      howMany: 2,
      lat: 10.123,
      lng: -84.123,
    }])),
    ...overrides,
  };
}

function createXenoCantoClientMock(overrides = {}) {
  return {
    getCostaRicaBirdSongs: jest.fn().mockResolvedValue({
      numRecordings: '2',
      numSpecies: '1',
      page: 1,
      numPages: 2,
      recordings: [
        {
          id: '774101',
          gen: 'Basileuterus',
          sp: 'delattrii',
          ssp: 'sample',
          en: 'Chestnut-capped Warbler',
          cnt: 'Costa Rica',
          loc: 'Puntarenas',
          lat: '9.9792',
          lon: '-84.8294',
          date: '2024-05-18',
          length: '0:42',
          file: 'https://xeno-canto.org/774101/download',
          'file-name': 'XC774101-RUFOUS-CAPPED-WARBLER.wav',
          sono: {
            small: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
            full: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/colour.png',
          },
          lic: 'https://creativecommons.org/licenses/by-sa/4.0/',
          rec: 'Paul Driver',
          ignored: 'not exported',
        },
        {
          id: '2',
          gen: 'Turdus',
          sp: 'grayi',
          en: 'Clay-colored Thrush',
          cnt: 'Costa Rica',
          loc: 'San Jose',
          lat: '9.9281',
          lon: '-84.0907',
          date: '2024-04-12',
          length: '1:08',
          file: 'https://xeno-canto.org/2/download',
          'file-name': 'clay-colored-thrush',
          sono: {
            full: 'full.png',
          },
          lic: 'https://creativecommons.org/licenses/by-sa/4.0/',
          rec: 'Mock Recorder',
        },
      ],
    }),
    ...overrides,
  };
}

function createMediaAssetServiceMock(overrides = {}) {
  return {
    uploadAudioFromUrl: jest.fn().mockResolvedValue({
      provider: 'xenocanto',
      assetType: 'audio',
      skipped: false,
    }),
    uploadImageFromUrl: jest.fn().mockResolvedValue({
      provider: 'xenocanto',
      assetType: 'image',
      skipped: false,
    }),
    ...overrides,
  };
}

function createINaturalistClientMock(overrides = {}) {
  return {
    searchTaxaByName: jest.fn().mockResolvedValue({
      total_results: 1,
      page: 1,
      per_page: 30,
      results: [
        {
          matched_term: 'Turquoise-browed Motmot',
          default_photo: {
            attribution: '(c) Mock Photographer, some rights reserved (CC BY), uploaded by Mock Photographer',
            license_code: 'cc-by',
            medium_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
            square_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
          },
          wikipedia_url: 'https://en.wikipedia.org/wiki/Turquoise-browed_motmot',
        },
      ],
    }),
    ...overrides,
  };
}

function createWikiServiceMock(overrides = {}) {
  return {
    getBirdDescription: jest.fn().mockResolvedValue('Turquoise-browed Motmot summary.'),
    ...overrides,
  };
}

describe('BirdsExportService', () => {
  let dataDir;

  beforeEach(async () => {
    jest.clearAllMocks();
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'birdwatching-external-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('normalizes the Xeno-canto attribution source URL from API config', () => {
    expect(normalizeXenoCantoSourceUrl('https://xeno-canto.org/api/3')).toBe('https://xeno-canto.org/');
  });

  it('normalizes Creative Commons license URLs', () => {
    expect(normalizeLicense('https://creativecommons.org/licenses/by-sa/4.0/'))
      .toBe('cc-by-sa');
    expect(normalizeLicense('https://creativecommons.org/licenses/by-nc-nd/4.0/'))
      .toBe('cc-by-nc-nd');
  });

  it('generates Xeno-canto asset filenames from recording IDs and media names', () => {
    expect(buildXenoCantoAudioAssetName({
      id: '774101',
      'file-name': 'XC774101-RUFOUS-CAPPED-WARBLER.wav',
      file: 'https://xeno-canto.org/774101/download',
    })).toBe('songs/774101.wav');

    expect(buildXenoCantoAudioAssetName({
      id: '106500',
      file: 'https://xeno-canto.org/106500/download',
    })).toBe('songs/106500.mp3');

    expect(extensionFromXenoCantoAudio({
      file: 'https://example.test/audio/example.ogg',
    })).toBe('.ogg');

    expect(buildXenoCantoSonogramAssetName({
      id: '774101',
      sono: {
        small: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
      },
    })).toBe('sonograms/774101_grey-small.png');
  });

  it('fetches and writes the eBird species list when no fresh file exists', async () => {
    const eBirdClient = createEBirdClientMock();
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
    });

    await expect(service.exportEBirdSpeciesList()).resolves.toMatchObject({
      provider: 'ebird',
      resource: 'species-list',
      skipped: false,
      count: 2,
    });

    await expect(readFile(path.join(dataDir, 'ebird-species-list-cr.json'), 'utf8'))
      .resolves.toBe('[\n  "higtin1",\n  "gretin1"\n]\n');
    expect(eBirdClient.getSpeciesList).toHaveBeenCalledWith('CR', {
      signal: undefined,
    });
  });

  it('skips the eBird species list when the file is fresh within one year', async () => {
    const eBirdClient = createEBirdClientMock();
    const filePath = path.join(dataDir, 'ebird-species-list-cr.json');
    await writeFile(filePath, '["cached"]\n');
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
    });

    await expect(service.exportEBirdSpeciesList()).resolves.toMatchObject({
      provider: 'ebird',
      resource: 'species-list',
      skipped: true,
      reason: 'fresh',
    });

    expect(eBirdClient.getSpeciesList).not.toHaveBeenCalled();
  });

  it('fetches missing eBird taxonomy in chunks of 50 and preserves existing records', async () => {
    const speciesCodes = Array.from({ length: 52 }, (_, index) => `bird${index}`);
    const eBirdClient = createEBirdClientMock({
      getTaxo: jest.fn().mockImplementation(async (species) => (
        species.split(',').map((speciesCode) => ({
          sciName: `Scientific ${speciesCode}`,
          comName: `Common ${speciesCode}`,
          speciesCode,
          familyComName: 'Family',
          familySciName: 'Familia',
        }))
      )),
    });
    await writeFile(path.join(dataDir, 'ebird-species-list-cr.json'), JSON.stringify(speciesCodes));
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      bird0: {
        sciName: 'Cached scientific',
        comName: 'Cached common',
        speciesCode: 'bird0',
        familyComName: 'Cached family',
        familySciName: 'Cached familia',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
    });

    await expect(service.exportEBirdTaxonomy()).resolves.toMatchObject({
      provider: 'ebird',
      resource: 'species-taxo',
      skipped: false,
      count: 52,
      fetchedCount: 51,
      skippedCount: 1,
    });

    expect(eBirdClient.getTaxo).toHaveBeenCalledTimes(2);
    expect(eBirdClient.getTaxo.mock.calls[0][0].split(',')).toHaveLength(50);
    expect(eBirdClient.getTaxo.mock.calls[1][0].split(',')).toHaveLength(1);

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'ebird-species-taxo-cr.json'),
      'utf8'
    ));
    expect(exported.bird0.comName).toBe('Cached common');
    expect(exported.bird1).toEqual({
      sciName: 'Scientific bird1',
      comName: 'Common bird1',
      speciesCode: 'bird1',
      familyComName: 'Family',
      familySciName: 'Familia',
    });
  });

  it('does not call eBird taxonomy when all species already exist', async () => {
    const eBirdClient = createEBirdClientMock();
    await writeFile(path.join(dataDir, 'ebird-species-list-cr.json'), JSON.stringify([
      'higtin1',
      'gretin1',
    ]));
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      higtin1: {
        speciesCode: 'higtin1',
      },
      gretin1: {
        speciesCode: 'gretin1',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
    });

    await expect(service.exportEBirdTaxonomy()).resolves.toMatchObject({
      skipped: true,
      fetchedCount: 0,
      skippedCount: 2,
    });

    expect(eBirdClient.getTaxo).not.toHaveBeenCalled();
  });

  it('runs eBird species list, taxonomy, and recent observations in order', async () => {
    const eBirdClient = createEBirdClientMock();
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
    });

    await expect(service.exportEBird()).resolves.toEqual([
      expect.objectContaining({
        resource: 'species-list',
      }),
      expect.objectContaining({
        resource: 'species-taxo',
      }),
      expect.objectContaining({
        resource: 'recent-observations',
      }),
    ]);

    expect(eBirdClient.getSpeciesList.mock.invocationCallOrder[0])
      .toBeLessThan(eBirdClient.getTaxo.mock.invocationCallOrder[0]);
    expect(eBirdClient.getTaxo.mock.invocationCallOrder[0])
      .toBeLessThan(eBirdClient.getRecentObservations.mock.invocationCallOrder[0]);
  });

  it('fetches and writes eBird recent observations when no fresh file exists', async () => {
    const eBirdClient = createEBirdClientMock({
      getRecentObservations: jest.fn().mockImplementation(async (_countryCode, speciesCode) => ({
        higtin1: [
          {
          speciesCode: 'higtin1',
          comName: 'Highland Tinamou',
          sciName: 'Nothocercus bonapartei',
          locId: 'L1',
          locName: 'Monteverde Cloud Forest Reserve',
          obsDt: '2026-05-18 08:12',
          howMany: 1,
          lat: 10.304,
          lng: -84.808,
          },
          {
          speciesCode: 'higtin1',
          comName: 'Highland Tinamou',
          sciName: 'Nothocercus bonapartei',
          locId: 'L1',
          locName: 'Monteverde Cloud Forest Reserve',
          obsDt: '2026-05-18 08:12',
          howMany: 1,
          lat: 10.304,
          lng: -84.808,
          },
          {
          speciesCode: 'higtin1',
          comName: 'Highland Tinamou',
          sciName: 'Nothocercus bonapartei',
          locId: 'L2',
          locName: 'Curi-Cancha Reserve',
          obsDt: '2026-05-19 09:30',
          howMany: 3,
          lat: 10.31,
          lng: -84.82,
          },
        ],
        gretin1: [
          {
          speciesCode: 'gretin1',
          comName: 'Great Tinamou',
          sciName: 'Tinamus major',
          locId: 'L3',
          locName: 'La Selva Biological Station',
          obsDt: '2026-05-17 06:15',
          howMany: 2,
          lat: 10.43,
          lng: -84.01,
          },
        ],
      }[speciesCode] || [])),
    });
    await writeFile(path.join(dataDir, 'ebird-species-list-cr.json'), JSON.stringify([
      'higtin1',
      'gretin1',
    ]));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
    });

    await expect(service.exportEBirdRecentObservations()).resolves.toMatchObject({
      provider: 'ebird',
      resource: 'recent-observations',
      skipped: false,
      count: 2,
    });

    await expect(readFile(path.join(dataDir, 'ebird-recent-observations-cr.json'), 'utf8'))
      .resolves.toBe(JSON.stringify({
        higtin1: {
          locations: [
            {
              locId: 'L2',
              locName: 'Curi-Cancha Reserve',
              obsDt: '2026-05-19 09:30',
              howMany: 3,
              lat: 10.31,
              lng: -84.82,
            },
            {
              locId: 'L1',
              locName: 'Monteverde Cloud Forest Reserve',
              obsDt: '2026-05-18 08:12',
              howMany: 1,
              lat: 10.304,
              lng: -84.808,
            },
          ],
          lstDt: '2026-05-19 09:30',
        },
        gretin1: {
          locations: [
            {
              locId: 'L3',
              locName: 'La Selva Biological Station',
              obsDt: '2026-05-17 06:15',
              howMany: 2,
              lat: 10.43,
              lng: -84.01,
            },
          ],
          lstDt: '2026-05-17 06:15',
        },
      }, null, 2).concat('\n'));
    expect(eBirdClient.getRecentObservations).toHaveBeenCalledTimes(2);
    expect(eBirdClient.getRecentObservations).toHaveBeenCalledWith('CR', 'higtin1', {
      signal: undefined,
    });
  });

  it('merges eBird recent observations with existing keyed observations', async () => {
    const now = Date.now();
    const eBirdClient = createEBirdClientMock({
      getRecentObservations: jest.fn().mockImplementation(async (_countryCode, speciesCode) => ({
        bkmtou1: [
          {
          speciesCode: 'bkmtou1',
          comName: 'Yellow-throated Toucan',
          sciName: 'Ramphastos ambiguus',
          locId: 'L4',
          locName: 'Arenal Nayara Hotel & Gardens',
          obsDt: '2026-05-20 05:55',
          howMany: 2,
          lat: 10.8145421,
          lng: -85.1786069,
          },
        ],
        newbrd1: [
          {
          speciesCode: 'newbrd1',
          comName: 'New Bird',
          sciName: 'Avis nova',
          locId: 'L5',
          locName: 'Tortuguero--Laguna Lodge',
          obsDt: '2026-05-20 06:15',
          howMany: 1,
          lat: 10.54,
          lng: -83.5,
          },
        ],
      }[speciesCode] || [])),
    });
    const filePath = path.join(dataDir, 'ebird-recent-observations-cr.json');
    await writeFile(path.join(dataDir, 'ebird-species-list-cr.json'), JSON.stringify([
      'bkmtou1',
      'newbrd1',
    ]));
    await writeFile(filePath, JSON.stringify({
      bkmtou1: {
        locations: [
          'Arenal--Nayara Hotel and Gardens',
          'Tortuguero--Laguna Lodge',
        ],
        obsDt: '2026-05-19 05:55',
        howMany: 1,
        lat: 10,
        lng: -85,
      },
      cached1: {
        locations: [
          'Cached Location',
        ],
        obsDt: '2026-05-18 05:55',
        howMany: 4,
        lat: 9,
        lng: -84,
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
      now: () => now + DAY_MS,
    });

    await expect(service.exportEBirdRecentObservations()).resolves.toMatchObject({
      provider: 'ebird',
      resource: 'recent-observations',
      skipped: false,
      count: 3,
    });

    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(exported).toEqual({
      bkmtou1: {
        locations: [
          {
            locId: 'L4',
            locName: 'Arenal Nayara Hotel & Gardens',
            obsDt: '2026-05-20 05:55',
            howMany: 2,
            lat: 10.8145421,
            lng: -85.1786069,
          },
          {
            locName: 'Tortuguero--Laguna Lodge',
            obsDt: '2026-05-19 05:55',
            howMany: 1,
            lat: 10,
            lng: -85,
          },
        ],
        lstDt: '2026-05-20 05:55',
      },
      cached1: {
        locations: [
          {
            locName: 'Cached Location',
            obsDt: '2026-05-18 05:55',
            howMany: 4,
            lat: 9,
            lng: -84,
          },
        ],
        lstDt: '2026-05-18 05:55',
      },
      newbrd1: {
        locations: [
          {
            locId: 'L5',
            locName: 'Tortuguero--Laguna Lodge',
            obsDt: '2026-05-20 06:15',
            howMany: 1,
            lat: 10.54,
            lng: -83.5,
          },
        ],
        lstDt: '2026-05-20 06:15',
      },
    });
    expect(eBirdClient.getRecentObservations).toHaveBeenCalledTimes(2);
  });

  it('continues eBird recent observations when one species returns a recoverable provider error', async () => {
    const eBirdClient = createEBirdClientMock({
      getRecentObservations: jest.fn().mockImplementation(async (_countryCode, speciesCode) => {
        if (speciesCode === 'badjson1') {
          const error = new Error('eBird returned malformed JSON');
          error.status = 502;
          error.code = 'EXTERNAL_API_MALFORMED_RESPONSE';
          throw error;
        }

        return [
          {
            speciesCode: 'higtin1',
            comName: 'Highland Tinamou',
            sciName: 'Nothocercus bonapartei',
            locId: 'L1',
            locName: 'Monteverde Cloud Forest Reserve',
            obsDt: '2026-05-18 08:12',
            howMany: 1,
            lat: 10.304,
            lng: -84.808,
          },
        ];
      }),
    });
    const filePath = path.join(dataDir, 'ebird-recent-observations-cr.json');
    await writeFile(path.join(dataDir, 'ebird-species-list-cr.json'), JSON.stringify([
      'badjson1',
      'higtin1',
    ]));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient,
    });

    await expect(service.exportEBirdRecentObservations()).resolves.toMatchObject({
      provider: 'ebird',
      resource: 'recent-observations',
      count: 1,
      fetchedCount: 1,
      failedCount: 1,
      failedSpeciesCodes: ['badjson1'],
    });

    await expect(readFile(filePath, 'utf8')).resolves.toContain('higtin1');
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipping eBird recent observations for one species after recoverable provider error',
      expect.objectContaining({
        event: 'ebird_recent_observations_species_skipped',
        code: 'EXTERNAL_API_MALFORMED_RESPONSE',
        failedCount: 1,
      })
    );
  });

  it('fetches all Xeno-canto pages through the client and writes one simplified keyed file', async () => {
    const xenoCantoClient = createXenoCantoClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await expect(service.exportXenoCantoCostaRicaBirdSongs({
      perPage: 500,
    })).resolves.toMatchObject({
      provider: 'xenocanto',
      resource: 'costa-rica-bird-songs',
      skipped: false,
      count: 2,
      pageCount: 2,
    });

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json'),
      'utf8'
    ));

    expect(exported).toEqual({
      'Chestnut-capped Warbler': {
        gen: 'Basileuterus',
        sp: 'delattrii',
        ssp: 'sample',
        en: 'Chestnut-capped Warbler',
        cnt: 'Costa Rica',
        loc: 'Puntarenas',
        lat: '9.9792',
        lon: '-84.8294',
        date: '2024-05-18',
        length: '0:42',
        file: 'songs/774101.wav',
        sono: 'sonograms/774101_grey-small.png',
        uploaded: true,
        attr_html: '<p>Sound recording by Paul Driver, sourced from <a href="https://xeno-canto.org/" target="_blank" rel="noopener noreferrer">xeno-canto</a>, recorded in Puntarenas, Costa Rica. Licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.</p>',
      },
      'Clay-colored Thrush': {
        gen: 'Turdus',
        sp: 'grayi',
        ssp: '',
        en: 'Clay-colored Thrush',
        cnt: 'Costa Rica',
        loc: 'San Jose',
        lat: '9.9281',
        lon: '-84.0907',
        date: '2024-04-12',
        length: '1:08',
        file: 'songs/2.mp3',
        uploaded: true,
        attr_html: '<p>Sound recording by Mock Recorder, sourced from <a href="https://xeno-canto.org/" target="_blank" rel="noopener noreferrer">xeno-canto</a>, recorded in San Jose, Costa Rica. Licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.</p>',
      },
    });
    expect(xenoCantoClient.getCostaRicaBirdSongs).toHaveBeenCalledWith({
      perPage: 500,
      signal: undefined,
    });
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/774101/download',
      {
        provider: 'xenocanto',
        key: 'songs/774101.wav',
        license: 'cc-by-sa',
        signal: undefined,
      }
    );
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/2/download',
      {
        provider: 'xenocanto',
        key: 'songs/2.mp3',
        license: 'cc-by-sa',
        signal: undefined,
      }
    );
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledTimes(1);
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
      {
        provider: 'xenocanto',
        key: 'sonograms/774101_grey-small.png',
        license: 'cc-by-sa',
        signal: undefined,
      }
    );
  });

  it('writes Xeno-canto export progress after each processed recording', async () => {
    const xenoCantoClient = createXenoCantoClientMock();
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    const mediaAssetService = createMediaAssetServiceMock({
      uploadAudioFromUrl: jest.fn().mockImplementation(async (assetUrl) => {
        if (assetUrl === 'https://xeno-canto.org/2/download') {
          const exported = JSON.parse(await readFile(filePath, 'utf8'));

          expect(exported).toEqual({
            'Chestnut-capped Warbler': expect.objectContaining({
              file: 'songs/774101.wav',
              sono: 'sonograms/774101_grey-small.png',
            }),
          });
        }

        return {
          provider: 'xenocanto',
          assetType: 'audio',
          skipped: false,
        };
      }),
    });
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await service.exportXenoCantoCostaRicaBirdSongs({ force: true });

    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(Object.keys(exported)).toEqual([
      'Chestnut-capped Warbler',
      'Clay-colored Thrush',
    ]);
  });

  it('uploads only one Xeno-canto recording per species from paginated results', async () => {
    const xenoCantoClient = createXenoCantoClientMock({
      getCostaRicaBirdSongs: jest.fn().mockResolvedValue({
        numRecordings: '3',
        numSpecies: '2',
        page: 1,
        numPages: 2,
        recordings: [
          {
            id: '154061',
            gen: 'Phaethornis',
            sp: 'longirostris',
            en: 'Long-billed Hermit',
            cnt: 'Costa Rica',
            loc: 'La Selva Biological Station',
            file: 'https://xeno-canto.org/154061/download',
            lic: 'https://creativecommons.org/licenses/by-sa/3.0/',
            rec: 'Marcelo Araya-Salas',
          },
          {
            id: '154062',
            gen: 'Phaethornis',
            sp: 'longirostris',
            en: 'Long-billed Hermit',
            cnt: 'Costa Rica',
            loc: 'Sarapiqui',
            file: 'https://xeno-canto.org/154062/download',
            lic: 'https://creativecommons.org/licenses/by-sa/3.0/',
            rec: 'Another Recorder',
          },
          {
            id: '154000',
            gen: 'Colibri',
            sp: 'delphinae',
            en: 'Brown Violetear',
            cnt: 'Costa Rica',
            loc: 'Virgen del Socorro',
            file: 'https://xeno-canto.org/154000/download',
            lic: 'https://creativecommons.org/licenses/by-sa/3.0/',
            rec: 'Marcelo Araya-Salas',
          },
        ],
      }),
    });
    const mediaAssetService = createMediaAssetServiceMock();
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await expect(service.exportXenoCantoCostaRicaBirdSongs({ force: true }))
      .resolves.toMatchObject({
        provider: 'xenocanto',
        resource: 'costa-rica-bird-songs',
        skipped: false,
        count: 2,
        pageCount: 2,
      });

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json'),
      'utf8'
    ));

    expect(Object.keys(exported)).toEqual([
      'Long-billed Hermit',
      'Brown Violetear',
    ]);
    expect(exported['Long-billed Hermit']).toMatchObject({
      file: 'songs/154061.mp3',
      loc: 'La Selva Biological Station',
    });
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledTimes(2);
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/154061/download',
      expect.objectContaining({
        key: 'songs/154061.mp3',
        license: 'cc-by-sa',
      })
    );
    expect(mediaAssetService.uploadAudioFromUrl).not.toHaveBeenCalledWith(
      'https://xeno-canto.org/154062/download',
      expect.anything()
    );
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/154000/download',
      expect.objectContaining({
        key: 'songs/154000.mp3',
        license: 'cc-by-sa',
      })
    );
  });

  it('skips Xeno-canto export when the file is fresh within one year', async () => {
    const xenoCantoClient = createXenoCantoClientMock();
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    await writeFile(filePath, JSON.stringify({
      'Cached Bird': {
        ssp: '',
        en: 'Cached Bird',
        attr_html: '<p>Sound recording sourced from <a href="https://xeno-canto.org/" target="_blank" rel="noopener noreferrer">xeno-canto</a>.</p>',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
    });

    await expect(service.exportXenoCantoCostaRicaBirdSongs()).resolves.toMatchObject({
      provider: 'xenocanto',
      resource: 'costa-rica-bird-songs',
      skipped: true,
      reason: 'fresh',
    });

    expect(xenoCantoClient.getCostaRicaBirdSongs).not.toHaveBeenCalled();
  });

  it('keeps deterministic Xeno-canto filenames when media uploads are skipped as duplicates', async () => {
    const xenoCantoClient = createXenoCantoClientMock({
      getCostaRicaBirdSongs: jest.fn().mockResolvedValue({
        numRecordings: '1',
        numSpecies: '1',
        page: 1,
        numPages: 1,
        recordings: [{
          id: '774101',
          gen: 'Basileuterus',
          sp: 'delattrii',
          en: 'Chestnut-capped Warbler',
          cnt: 'Costa Rica',
          loc: 'Puntarenas',
          file: 'https://xeno-canto.org/774101/download',
          'file-name': 'XC774101-RUFOUS-CAPPED-WARBLER.wav',
          lic: 'https://creativecommons.org/licenses/by-sa/4.0/',
          sono: {
            small: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
          },
        }],
      }),
    });
    const mediaAssetService = createMediaAssetServiceMock({
      uploadAudioFromUrl: jest.fn().mockResolvedValue({ skipped: true, reason: 'exists' }),
      uploadImageFromUrl: jest.fn().mockResolvedValue({ skipped: true, reason: 'exists' }),
    });
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await service.exportXenoCantoCostaRicaBirdSongs({ force: true });

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json'),
      'utf8'
    ));
    expect(exported['Chestnut-capped Warbler']).toMatchObject({
      file: 'songs/774101.wav',
      sono: 'sonograms/774101_grey-small.png',
    });
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledTimes(1);
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledTimes(1);
  });

  it('reuses existing deterministic Xeno-canto media exports without uploading them again', async () => {
    const xenoCantoClient = createXenoCantoClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    await writeFile(filePath, JSON.stringify({
      'Chestnut-capped Warbler': {
        en: 'Chestnut-capped Warbler',
        file: 'songs/774101.wav',
        sono: 'sonograms/774101_grey-small.png',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await service.exportXenoCantoCostaRicaBirdSongs({ force: true });

    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(exported['Chestnut-capped Warbler']).toMatchObject({
      file: 'songs/774101.wav',
      sono: 'sonograms/774101_grey-small.png',
    });
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/2/download',
      expect.objectContaining({
        key: 'songs/2.mp3',
        license: 'cc-by-sa',
      })
    );
    expect(mediaAssetService.uploadAudioFromUrl).not.toHaveBeenCalledWith(
      'https://xeno-canto.org/774101/download',
      expect.anything()
    );
    expect(mediaAssetService.uploadImageFromUrl).not.toHaveBeenCalled();
  });

  it('uploads missing Xeno-canto audio while reusing an existing sonogram export', async () => {
    const xenoCantoClient = createXenoCantoClientMock({
      getCostaRicaBirdSongs: jest.fn().mockResolvedValue({
        numRecordings: '1',
        numSpecies: '1',
        page: 1,
        numPages: 1,
        recordings: [{
          id: '774101',
          gen: 'Basileuterus',
          sp: 'delattrii',
          en: 'Chestnut-capped Warbler',
          cnt: 'Costa Rica',
          loc: 'Puntarenas',
          file: 'https://xeno-canto.org/774101/download',
          'file-name': 'XC774101-RUFOUS-CAPPED-WARBLER.wav',
          lic: 'https://creativecommons.org/licenses/by-sa/4.0/',
          sono: {
            small: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
          },
        }],
      }),
    });
    const mediaAssetService = createMediaAssetServiceMock();
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    await writeFile(filePath, JSON.stringify({
      'Chestnut-capped Warbler': {
        en: 'Chestnut-capped Warbler',
        sono: 'sonograms/774101_grey-small.png',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await service.exportXenoCantoCostaRicaBirdSongs({ force: true });

    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(exported['Chestnut-capped Warbler']).toMatchObject({
      file: 'songs/774101.wav',
      sono: 'sonograms/774101_grey-small.png',
    });
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledTimes(1);
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/774101/download',
      expect.objectContaining({
        key: 'songs/774101.wav',
        license: 'cc-by-sa',
      })
    );
    expect(mediaAssetService.uploadImageFromUrl).not.toHaveBeenCalled();
  });

  it('uploads missing Xeno-canto sonogram while reusing an existing audio export', async () => {
    const xenoCantoClient = createXenoCantoClientMock({
      getCostaRicaBirdSongs: jest.fn().mockResolvedValue({
        numRecordings: '1',
        numSpecies: '1',
        page: 1,
        numPages: 1,
        recordings: [{
          id: '774101',
          gen: 'Basileuterus',
          sp: 'delattrii',
          en: 'Chestnut-capped Warbler',
          cnt: 'Costa Rica',
          loc: 'Puntarenas',
          file: 'https://xeno-canto.org/774101/download',
          'file-name': 'XC774101-RUFOUS-CAPPED-WARBLER.wav',
          lic: 'https://creativecommons.org/licenses/by-sa/4.0/',
          sono: {
            small: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
          },
        }],
      }),
    });
    const mediaAssetService = createMediaAssetServiceMock();
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    await writeFile(filePath, JSON.stringify({
      'Chestnut-capped Warbler': {
        en: 'Chestnut-capped Warbler',
        file: 'songs/774101.wav',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await service.exportXenoCantoCostaRicaBirdSongs({ force: true });

    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(exported['Chestnut-capped Warbler']).toMatchObject({
      file: 'songs/774101.wav',
      sono: 'sonograms/774101_grey-small.png',
    });
    expect(mediaAssetService.uploadAudioFromUrl).not.toHaveBeenCalled();
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledTimes(1);
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
      expect.objectContaining({
        key: 'sonograms/774101_grey-small.png',
        license: 'cc-by-sa',
      })
    );
  });

  it('hotlinks Xeno-canto media when the license is not uploadable', async () => {
    const xenoCantoClient = createXenoCantoClientMock({
      getCostaRicaBirdSongs: jest.fn().mockResolvedValue({
        numRecordings: '1',
        numSpecies: '1',
        page: 1,
        numPages: 1,
        recordings: [{
          id: '774101',
          gen: 'Basileuterus',
          sp: 'delattrii',
          en: 'Chestnut-capped Warbler',
          cnt: 'Costa Rica',
          loc: 'Puntarenas',
          file: 'https://xeno-canto.org/774101/download',
          'file-name': 'XC774101-RUFOUS-CAPPED-WARBLER.wav',
          lic: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
          rec: 'Paul Driver',
          sono: {
            small: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
          },
        }],
      }),
    });
    const mediaAssetService = createMediaAssetServiceMock({
      uploadAudioFromUrl: jest.fn().mockImplementation(async (assetUrl, options) => ({
        provider: options.provider,
        assetType: 'audio',
        license: options.license,
        skipped: true,
        uploaded: false,
        reason: 'restricted_license',
        hotlinkUrl: assetUrl,
      })),
      uploadImageFromUrl: jest.fn().mockImplementation(async (assetUrl, options) => ({
        provider: options.provider,
        assetType: 'image',
        license: options.license,
        skipped: true,
        uploaded: false,
        reason: 'restricted_license',
        hotlinkUrl: assetUrl,
      })),
    });
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await service.exportXenoCantoCostaRicaBirdSongs({ force: true });

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json'),
      'utf8'
    ));
    expect(exported['Chestnut-capped Warbler']).toMatchObject({
      file: 'https://xeno-canto.org/774101/download',
      sono: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
    });
    expect(exported['Chestnut-capped Warbler']).not.toHaveProperty('uploaded');
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/774101/download',
      expect.objectContaining({
        key: 'songs/774101.wav',
        license: 'cc-by-nc-sa',
      })
    );
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/grey-small.png',
      expect.objectContaining({
        key: 'sonograms/774101_grey-small.png',
        license: 'cc-by-nc-sa',
      })
    );
  });

  it('preserves incremental Xeno-canto progress and rethrows when a later recording fails', async () => {
    const xenoCantoClient = createXenoCantoClientMock();
    const mediaAssetService = createMediaAssetServiceMock({
      uploadAudioFromUrl: jest.fn().mockImplementation(async (assetUrl) => {
        if (assetUrl === 'https://xeno-canto.org/2/download') {
          throw new Error('download stopped');
        }

        return {
          provider: 'xenocanto',
          assetType: 'audio',
          skipped: false,
        };
      }),
    });
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await expect(service.exportXenoCantoCostaRicaBirdSongs({ force: true }))
      .rejects.toThrow('download stopped');

    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(exported).toEqual({
      'Chestnut-capped Warbler': expect.objectContaining({
        file: 'songs/774101.wav',
        sono: 'sonograms/774101_grey-small.png',
      }),
    });
    expect(logger.error).toHaveBeenCalledWith('Xeno-canto recording export failed', {
      provider: 'xenocanto',
      recordingId: '2',
      name: 'Clay-colored Thrush',
      error: 'download stopped',
    });
  });

  it('migrates a fresh keyed Xeno-canto file to path-only media URLs', async () => {
    const xenoCantoClient = createXenoCantoClientMock();
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    await writeFile(filePath, JSON.stringify({
      'Chestnut-capped Warbler': {
        id: '774101',
        gen: 'Basileuterus',
        sp: 'delattrii',
        ssp: '',
        en: 'Chestnut-capped Warbler',
        cnt: 'Costa Rica',
        loc: 'Puntarenas',
        file: 'https://xeno-canto.org/774101/download',
        sono: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/colour.png',
        lic: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        rec: 'Paul Driver',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
    });

    await expect(service.exportXenoCantoCostaRicaBirdSongs()).resolves.toMatchObject({
      provider: 'xenocanto',
      resource: 'costa-rica-bird-songs',
      skipped: false,
      reason: 'migrated',
      count: 1,
    });

    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(exported['Chestnut-capped Warbler']).toEqual({
      gen: 'Basileuterus',
      sp: 'delattrii',
      ssp: '',
      en: 'Chestnut-capped Warbler',
      cnt: 'Costa Rica',
      loc: 'Puntarenas',
      file: '/774101/download',
      sono: '/sounds/spectrograms/FSCGENVPXK/774101/colour.png',
      attr_html: '<p>Sound recording by Paul Driver, sourced from <a href="https://xeno-canto.org/" target="_blank" rel="noopener noreferrer">xeno-canto</a>, recorded in Puntarenas, Costa Rica. Licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>.</p>',
    });
    expect(xenoCantoClient.getCostaRicaBirdSongs).not.toHaveBeenCalled();
  });

  it('migrates a fresh raw Xeno-canto response file without calling the API', async () => {
    const xenoCantoClient = createXenoCantoClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const filePath = path.join(dataDir, 'xenocanto-costa-rica-bird-songs.json');
    await writeFile(filePath, JSON.stringify({
      recordings: [
        {
          id: '774101',
          gen: 'Basileuterus',
          sp: 'delattrii',
          en: 'Chestnut-capped Warbler',
          cnt: 'Costa Rica',
          loc: 'Puntarenas',
          file: 'https://xeno-canto.org/774101/download',
          'file-name': 'XC774101-RUFOUS-CAPPED-WARBLER.wav',
          sono: {
            full: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/colour.png',
          },
          lic: 'https://creativecommons.org/licenses/by-sa/4.0/',
          rec: 'Paul Driver',
          ignored: true,
        },
      ],
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      xenoCantoClient,
      mediaAssetService,
    });

    await expect(service.exportXenoCantoCostaRicaBirdSongs()).resolves.toMatchObject({
      provider: 'xenocanto',
      resource: 'costa-rica-bird-songs',
      skipped: false,
      reason: 'migrated',
      count: 1,
    });

    await expect(readFile(filePath, 'utf8')).resolves.toBe(JSON.stringify({
      'Chestnut-capped Warbler': {
        gen: 'Basileuterus',
        sp: 'delattrii',
        ssp: '',
        en: 'Chestnut-capped Warbler',
        cnt: 'Costa Rica',
        loc: 'Puntarenas',
        file: 'songs/774101.wav',
        uploaded: true,
        attr_html: '<p>Sound recording by Paul Driver, sourced from <a href="https://xeno-canto.org/" target="_blank" rel="noopener noreferrer">xeno-canto</a>, recorded in Puntarenas, Costa Rica. Licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.</p>',
      },
    }, null, 2).concat('\n'));
    expect(xenoCantoClient.getCostaRicaBirdSongs).not.toHaveBeenCalled();
    expect(mediaAssetService.uploadAudioFromUrl).toHaveBeenCalledWith(
      'https://xeno-canto.org/774101/download',
      {
        provider: 'xenocanto',
        key: 'songs/774101.wav',
        license: 'cc-by-sa',
        signal: undefined,
      }
    );
    expect(mediaAssetService.uploadImageFromUrl).not.toHaveBeenCalled();
  });

  it('reads eBird taxonomy, matches iNaturalist taxa, and writes image updates', async () => {
    const iNaturalistClient = createINaturalistClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const wikiService = createWikiServiceMock();
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'different-provider-code',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      wikiService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await expect(service.exportINaturalistCostaRicaBirdImages()).resolves.toMatchObject({
      provider: 'inaturalist',
      resource: 'costa-rica-bird-images',
      count: 1,
      fetchedCount: 1,
      skippedCount: 0,
    });

    await expect(readFile(path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'), 'utf8'))
      .resolves.toBe(JSON.stringify({
        tubmot1: {
          speciesCode: 'tubmot1',
          attribution: '(c) Mock Photographer, some rights reserved (CC BY), uploaded by Mock Photographer',
          photo: '/photos/582371550_medium.jpg',
          squarePhoto: '/photos/582371550_square.jpg',
          uploaded: true,
          'lastUpdate': '2026-05-20',
          wikiTitle: 'Turquoise-browed_motmot',
          extract: 'Turquoise-browed Motmot summary.',
        },
      }, null, 2).concat('\n'));
    expect(iNaturalistClient.searchTaxaByName).toHaveBeenCalledWith('Turquoise-browed Motmot', {
      signal: undefined,
    });
    expect(wikiService.getBirdDescription).toHaveBeenCalledWith('Turquoise-browed_motmot', {
      signal: undefined,
    });
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
      {
        provider: 'inaturalist',
        key: 'photos/582371550_medium.jpg',
        license: 'cc-by',
        signal: undefined,
      }
    );
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
      {
        provider: 'inaturalist',
        key: 'photos/582371550_square.jpg',
        license: 'cc-by',
        signal: undefined,
      }
    );
  });

  it('uploads iNaturalist images from the API-provided host', async () => {
    const iNaturalistClient = createINaturalistClientMock({
      searchTaxaByName: jest.fn().mockResolvedValue({
        total_results: 1,
        page: 1,
        per_page: 30,
        results: [
          {
            matched_term: 'Turquoise-browed Motmot',
            default_photo: {
              attribution: '(c) Host Flexible Photographer, some rights reserved (CC BY-SA)',
              license_code: 'cc-by-sa',
              medium_url: 'https://cdn.example.test/media/photos/582371550/medium.jpg',
              square_url: 'https://cdn.example.test/media/photos/582371550/square.jpg',
            },
          },
        ],
      }),
    });
    const mediaAssetService = createMediaAssetServiceMock();
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'tubmot1',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await service.exportINaturalistCostaRicaBirdImages();

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'),
      'utf8'
    ));
    expect(exported.tubmot1).toMatchObject({
      photo: '/photos/582371550_medium.jpg',
      squarePhoto: '/photos/582371550_square.jpg',
      uploaded: true,
    });
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://cdn.example.test/media/photos/582371550/medium.jpg',
      expect.objectContaining({
        key: 'photos/582371550_medium.jpg',
        license: 'cc-by-sa',
      })
    );
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://cdn.example.test/media/photos/582371550/square.jpg',
      expect.objectContaining({
        key: 'photos/582371550_square.jpg',
        license: 'cc-by-sa',
      })
    );
  });

  it('hotlinks iNaturalist images whose licenses are not uploadable', async () => {
    const iNaturalistClient = createINaturalistClientMock({
      searchTaxaByName: jest.fn().mockResolvedValue({
        total_results: 1,
        page: 1,
        per_page: 30,
        results: [
          {
            matched_term: 'Turquoise-browed Motmot',
            default_photo: {
              attribution: '(c) Restricted Photographer, some rights reserved (CC BY-NC), uploaded by Restricted Photographer',
              license_code: 'cc-by-nc',
              medium_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
              square_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
            },
            wikipedia_url: 'https://en.wikipedia.org/wiki/Turquoise-browed_motmot',
          },
        ],
      }),
    });
    const mediaAssetService = createMediaAssetServiceMock({
      uploadImageFromUrl: jest.fn().mockImplementation(async (assetUrl, options) => ({
        provider: options.provider,
        assetType: 'image',
        license: options.license,
        skipped: true,
        uploaded: false,
        reason: 'restricted_license',
        hotlinkUrl: assetUrl,
      })),
    });
    const wikiService = createWikiServiceMock();
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'tubmot1',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      wikiService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await service.exportINaturalistCostaRicaBirdImages();

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'),
      'utf8'
    ));
    expect(exported.tubmot1).toEqual({
      speciesCode: 'tubmot1',
      attribution: '(c) Restricted Photographer, some rights reserved (CC BY-NC), uploaded by Restricted Photographer',
      photo: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
      squarePhoto: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
      lastUpdate: '2026-05-20',
      wikiTitle: 'Turquoise-browed_motmot',
      extract: 'Turquoise-browed Motmot summary.',
    });
    expect(exported.tubmot1).not.toHaveProperty('uploaded');
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
      expect.objectContaining({
        key: 'photos/582371550_medium.jpg',
        license: 'cc-by-nc',
      })
    );
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
      expect.objectContaining({
        key: 'photos/582371550_square.jpg',
        license: 'cc-by-nc',
      })
    );
  });

  it('uses taxonomy entries instead of recent observations for iNaturalist images', async () => {
    const iNaturalistClient = createINaturalistClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const wikiService = createWikiServiceMock();
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      taxmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'taxmot1',
      },
    }));
    await writeFile(path.join(dataDir, 'ebird-recent-observations-cr.json'), JSON.stringify([
      {
        speciesCode: 'obsjay1',
        comName: 'Brown Jay',
      },
    ]));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      wikiService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await service.exportINaturalistCostaRicaBirdImages();

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'),
      'utf8'
    ));
    expect(Object.keys(exported)).toEqual(['taxmot1']);
    expect(iNaturalistClient.searchTaxaByName).toHaveBeenCalledWith('Turquoise-browed Motmot', {
      signal: undefined,
    });
    expect(iNaturalistClient.searchTaxaByName).not.toHaveBeenCalledWith('Brown Jay', {
      signal: undefined,
    });
  });

  it('reuses existing deterministic iNaturalist image exports without uploading them again', async () => {
    const iNaturalistClient = createINaturalistClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const wikiService = createWikiServiceMock();
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'tubmot1',
      },
    }));
    await writeFile(path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'), JSON.stringify({
      tubmot1: {
        speciesCode: 'tubmot1',
        attribution: '(c) Cached Photographer',
        license: 'cc-by',
        photo: '/photos/582371550_medium.jpg',
        squarePhoto: '/photos/582371550_square.jpg',
        lastUpdate: '2024-01-01',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      wikiService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await service.exportINaturalistCostaRicaBirdImages({ force: true });

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'),
      'utf8'
    ));
    expect(exported.tubmot1).toMatchObject({
      photo: '/photos/582371550_medium.jpg',
      squarePhoto: '/photos/582371550_square.jpg',
      lastUpdate: '2026-05-20',
    });
    expect(mediaAssetService.uploadImageFromUrl).not.toHaveBeenCalled();
  });

  it('writes iNaturalist image progress after each processed species', async () => {
    const iNaturalistClient = createINaturalistClientMock({
      searchTaxaByName: jest.fn()
        .mockResolvedValueOnce({
          total_results: 1,
          page: 1,
          per_page: 30,
          results: [
            {
              matched_term: 'Turquoise-browed Motmot',
              default_photo: {
                medium_url: 'first.jpg',
              },
              wikipedia_url: 'https://en.wikipedia.org/wiki/Turquoise-browed_motmot',
            },
          ],
        })
        .mockRejectedValueOnce(new Error('provider stopped')),
    });
    const wikiService = createWikiServiceMock();
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'tubmot1',
      },
      brnjay: {
        comName: 'Brown Jay',
        speciesCode: 'brnjay',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      wikiService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await expect(service.exportINaturalistCostaRicaBirdImages()).rejects.toThrow('provider stopped');

    await expect(readFile(path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'), 'utf8'))
      .resolves.toBe(JSON.stringify({
        tubmot1: {
          speciesCode: 'tubmot1',
          photo: 'first.jpg',
          lastUpdate: '2026-05-20',
          wikiTitle: 'Turquoise-browed_motmot',
          extract: 'Turquoise-browed Motmot summary.',
        },
      }, null, 2).concat('\n'));
  });

  it('skips fresh iNaturalist species and preserves existing photo entries', async () => {
    const iNaturalistClient = createINaturalistClientMock();
    const wikiService = createWikiServiceMock();
    const mediaAssetService = createMediaAssetServiceMock({
      uploadImageFromUrl: jest.fn().mockImplementation(async (assetUrl, options) => ({
        provider: options.provider,
        assetType: 'image',
        license: options.license,
        skipped: true,
        uploaded: false,
        reason: 'restricted_license',
        hotlinkUrl: assetUrl,
      })),
    });
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'tubmot1',
      },
    }));
    await writeFile(path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'), JSON.stringify({
      updates: {
        tubmot1: '2026-05-01',
      },
      photos: [
        {
          speciesCode: 'tubmot1',
          comName: 'Turquoise-browed Motmot',
          attribution: '(c) Cached Photographer, all rights reserved, uploaded by Cached Photographer',
          photo: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
          squarePhoto: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
          wikiTitle: 'https://en.wikipedia.org/wiki/Turquoise-browed_motmot',
          extract: 'Cached Motmot summary.',
        },
      ],
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      wikiService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await expect(service.exportINaturalistCostaRicaBirdImages()).resolves.toMatchObject({
      count: 1,
      fetchedCount: 0,
      skippedCount: 1,
    });

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'),
      'utf8'
    ));
    expect(exported).toEqual({
      tubmot1: {
        speciesCode: 'tubmot1',
        attribution: '(c) Cached Photographer, all rights reserved, uploaded by Cached Photographer',
        photo: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
        squarePhoto: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
        lastUpdate: '2026-05-01',
        wikiTitle: 'Turquoise-browed_motmot',
        extract: 'Cached Motmot summary.',
      },
    });
    expect(wikiService.getBirdDescription).not.toHaveBeenCalled();
    expect(iNaturalistClient.searchTaxaByName).not.toHaveBeenCalled();
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
      expect.objectContaining({
        key: 'photos/582371550_medium.jpg',
        license: 'all rights reserved',
      })
    );
    expect(mediaAssetService.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/square.jpg',
      expect.objectContaining({
        key: 'photos/582371550_square.jpg',
        license: 'all rights reserved',
      })
    );
  });

  it('preserves fresh iNaturalist external asset keys when the source URL is unavailable', async () => {
    const iNaturalistClient = createINaturalistClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const wikiService = createWikiServiceMock({
      getBirdDescription: jest.fn().mockResolvedValue('Highland Tinamou summary.'),
    });
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      higtin1: {
        comName: 'Highland Tinamou',
        speciesCode: 'higtin1',
      },
    }));
    await writeFile(path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'), JSON.stringify({
      higtin1: {
        speciesCode: 'higtin1',
        attribution: '(c) Cached Photographer',
        photo: 'external/inaturalist/images/photos/437724525/medium.jpeg',
        squarePhoto: 'external/inaturalist/images/photos/437724525/square.jpeg',
        lastUpdate: '2026-05-25',
        wikiTitle: 'Highland_tinamou',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      wikiService,
      now: () => Date.parse('2026-05-25T12:00:00.000Z'),
    });

    await service.exportINaturalistCostaRicaBirdImages();

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'),
      'utf8'
    ));
    expect(exported).toEqual({
      higtin1: {
        speciesCode: 'higtin1',
        attribution: '(c) Cached Photographer',
        photo: 'external/inaturalist/images/photos/437724525/medium.jpeg',
        squarePhoto: 'external/inaturalist/images/photos/437724525/square.jpeg',
        lastUpdate: '2026-05-25',
        wikiTitle: 'Highland_tinamou',
        extract: 'Highland Tinamou summary.',
      },
    });
    expect(wikiService.getBirdDescription).toHaveBeenCalledWith('Highland_tinamou', {
      signal: undefined,
    });
    expect(iNaturalistClient.searchTaxaByName).not.toHaveBeenCalled();
    expect(mediaAssetService.uploadImageFromUrl).not.toHaveBeenCalled();
  });

  it('skips taxonomy entries without a common name before searching iNaturalist', async () => {
    const iNaturalistClient = createINaturalistClientMock();
    const mediaAssetService = createMediaAssetServiceMock();
    const wikiService = createWikiServiceMock();
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'tubmot1',
      },
      noname1: {
        speciesCode: 'noname1',
      },
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      mediaAssetService,
      wikiService,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await service.exportINaturalistCostaRicaBirdImages();

    expect(iNaturalistClient.searchTaxaByName).toHaveBeenCalledTimes(1);
    expect(iNaturalistClient.searchTaxaByName).toHaveBeenCalledWith('Turquoise-browed Motmot', {
      signal: undefined,
    });
  });

  it('updates stale iNaturalist species without inventing a photo when no match exists', async () => {
    const iNaturalistClient = createINaturalistClientMock({
      searchTaxaByName: jest.fn().mockResolvedValue({
        total_results: 1,
        page: 1,
        per_page: 30,
        results: [
          {
            matched_term: 'Wrong Bird',
            default_photo: {
              medium_url: 'wrong.jpg',
            },
          },
        ],
      }),
    });
    await writeFile(path.join(dataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      tubmot1: {
        comName: 'Turquoise-browed Motmot',
        speciesCode: 'tubmot1',
      },
    }));
    await writeFile(path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'), JSON.stringify({
      updates: {
        tubmot1: '2024-01-01',
      },
      photos: [
        {
          speciesCode: 'tubmot1',
          comName: 'Turquoise-browed Motmot',
          photo: 'stale.jpg',
        },
      ],
    }));
    const service = new BirdsExportService({
      dataDir,
      eBirdClient: createEBirdClientMock(),
      iNaturalistClient,
      now: () => Date.parse('2026-05-20T12:00:00.000Z'),
    });

    await service.exportINaturalistCostaRicaBirdImages();

    const exported = JSON.parse(await readFile(
      path.join(dataDir, 'inaturalist-costa-rica-bird-images.json'),
      'utf8'
    ));
    expect(exported).toEqual({});
  });
});

describe('enrich CLI helpers', () => {
  it('parses target arguments and options', () => {
    expect(parseArgs(['birds', '--force', '--country', 'CR', '--per-page', '250'])).toEqual({
      target: 'birds',
      options: {
        force: true,
        forceDescriptions: false,
        countryCode: 'CR',
        perPage: 250,
      },
    });
  });

  it('requires an enrichment target', () => {
    expect(() => parseArgs([])).toThrow('Enrichment target is required');
  });

  it('runs the selected enrichment target', async () => {
    const birdsExportService = {
      enrichBirds: jest.fn().mockResolvedValue({ target: 'birds' }),
    };

    await expect(runEnrichCli(['birds'], {
      birdsExportService,
    })).resolves.toEqual({ target: 'birds' });

    expect(birdsExportService.enrichBirds).toHaveBeenCalledWith({
      force: false,
      forceDescriptions: false,
      countryCode: 'CR',
      perPage: 500,
    });
  });
});
