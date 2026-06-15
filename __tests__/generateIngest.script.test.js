import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { jest } from '@jest/globals';
import os from 'os';
import path from 'path';
import {
  generateBirdIngestData,
} from '../src/ingestion/services/birdsIngest.service.js';
import {
  buildBirdDocuments,
  buildMedia,
  selectLatestObservation,
} from '../src/ingestion/utils/birdsIngest.utils.js';

describe('bird ingest data generation helpers', () => {
  test('buildMedia keeps stable empty song fields when no song matched', () => {
    expect(buildMedia({
      photo: '/photo.jpg',
      squarePhoto: '/square.jpg',
      attribution: '(c) Photo Person',
      wikiTitle: 'Example_bird',
      lastUpdate: '2026-05-26',
    }, null)).toEqual({
      photo: '/photo.jpg',
      squarePhoto: '/square.jpg',
      photoAttribution: '(c) Photo Person',
      wikiTitle: 'Example_bird',
      song: null,
      sono: null,
      songLength: null,
      songAttributionHtml: null,
    });
  });

  test('selectLatestObservation chooses the most recent observation', () => {
    expect(selectLatestObservation([
      { obsDt: '2026-05-19 05:20', locations: ['Older'] },
      { obsDt: '2026-05-21 05:10', locations: ['Newer'] },
    ])).toEqual({
      obsDt: '2026-05-21 05:10',
      locations: ['Newer'],
      lat: null,
      lng: null,
    });
  });

  test('buildBirdDocuments combines bird taxonomy, media, observations, and descriptions', async () => {
    await expect(buildBirdDocuments({
      taxonomy: {
        higtin1: {
          sciName: 'Nothocercus bonapartei',
          comName: 'Highland Tinamou',
          speciesCode: 'higtin1',
          familyComName: 'Tinamous',
          familySciName: 'Tinamidae',
        },
      },
      images: {
        higtin1: {
          speciesCode: 'higtin1',
          photo: '/highland-tinamou.jpg',
          squarePhoto: '/highland-tinamou-square.jpg',
          attribution: '(c) Highland Photo Person',
          wikiTitle: 'Highland_tinamou',
          extract: 'A large forest tinamou.',
        },
      },
      observations: {
        higtin1: [
          {
            locName: 'Old Site',
            obsDt: '2026-05-20 06:15',
            howMany: 1,
            lat: 10,
            lng: -84,
          },
          {
            locId: 'L123',
            locName: 'New Site',
            obsDt: '2026-05-21 05:10',
            howMany: 3,
            lat: 10.45575,
            lng: -84.661435,
          },
        ],
      },
      songs: {
        'Highland Tinamou': {
          file: 'https://xeno-canto.org/123/download',
          sono: 'https://xeno-canto.org/sounds/spectrograms/example.png',
          rec: 'Marcelo Araya-Salas',
          cnt: 'Costa Rica',
          loc: 'Monteverde',
          date: '2026-05-20',
          lat: '10.2993',
          lon: '-84.8174',
          length: '0:42',
          attr_html: '<p>Sound recording by Marcelo Araya-Salas</p>',
        },
      },
    })).resolves.toEqual([
      {
        externalId: 'bird-higtin1',
        name: 'Highland Tinamou',
        family: 'Tinamous',
        description: 'A large forest tinamou.',
        locations: ['New Site', 'Old Site', 'Monteverde'],
        documentType: 'bird_profile',
        category: 'Tinamous',
        tags: ['Highland Tinamou', 'Nothocercus bonapartei', 'higtin1', 'Tinamous'],
        metadata: {
          speciesCode: 'higtin1',
          scientificName: 'Nothocercus bonapartei',
          familyScientificName: 'Tinamidae',
          lastObservation: {
            locId: 'L123',
            locName: 'New Site',
            obsDt: '2026-05-21 05:10',
            howMany: 3,
            lat: 10.45575,
            lng: -84.661435,
          },
          recentObservations: {
            lastObservedAt: '2026-05-21 05:10',
            locationCount: 3,
            locations: [
              {
                locId: 'L123',
                locName: 'New Site',
                obsDt: '2026-05-21 05:10',
                howMany: 3,
                lat: 10.45575,
                lng: -84.661435,
              },
              {
                locId: null,
                locName: 'Old Site',
                obsDt: '2026-05-20 06:15',
                howMany: 1,
                lat: 10,
                lng: -84,
              },
              {
                locId: null,
                locName: 'Monteverde',
                obsDt: '2026-05-20',
                howMany: null,
                lat: 10.2993,
                lng: -84.8174,
              },
            ],
          },
          media: {
            photoUrl: '/highland-tinamou.jpg',
            squarePhotoUrl: '/highland-tinamou-square.jpg',
            photoAttribution: '(c) Highland Photo Person',
            wikiTitle: 'Highland_tinamou',
            songUrl: 'https://xeno-canto.org/123/download',
            sonogramUrl: 'https://xeno-canto.org/sounds/spectrograms/example.png',
            songLength: '0:42',
            songAttributionHtml: '<p>Sound recording by Marcelo Araya-Salas</p>',
          },
        },
      },
    ]);

  });

  test('buildBirdDocuments reuses existing descriptions by default', async () => {
    await expect(buildBirdDocuments({
      taxonomy: {
        higtin1: {
          sciName: 'Nothocercus bonapartei',
          comName: 'Highland Tinamou',
          speciesCode: 'higtin1',
          familyComName: 'Tinamous',
          familySciName: 'Tinamidae',
        },
      },
      images: {},
      observations: {},
      songs: {},
    }, {
      existingDocuments: [{
        speciesCode: 'higtin1',
        description: 'Cached description.',
      }],
    })).resolves.toMatchObject([{
      externalId: 'bird-higtin1',
      description: 'Cached description.',
      metadata: {
        speciesCode: 'higtin1',
      },
    }]);

  });

  test('buildBirdDocuments enriches sparse provider data from existing RAG metadata', async () => {
    await expect(buildBirdDocuments({
      taxonomy: {
        clcrob: {
          sciName: 'Turdus grayi',
          comName: 'Clay-colored Thrush',
          speciesCode: 'clcrob',
          familyComName: 'Thrushes',
          familySciName: 'Turdidae',
        },
      },
      images: {},
      observations: {},
      songs: {},
    }, {
      existingDocuments: [{
        externalId: 'bird-clcrob',
        description: 'Common in gardens and forest edge.',
        locations: ['Central Valley'],
        tags: ['national bird'],
        metadata: {
          speciesCode: 'clcrob',
          media: {
            photoUrl: '/photos/clcrob.jpg',
            squarePhotoUrl: '/photos/clcrob-square.jpg',
            photoAttribution: '(c) Local observer',
          },
        },
      }],
    })).resolves.toMatchObject([{
      externalId: 'bird-clcrob',
      description: 'Common in gardens and forest edge.',
      locations: ['Central Valley'],
      tags: [
        'Clay-colored Thrush',
        'Turdus grayi',
        'clcrob',
        'Thrushes',
        'national bird',
      ],
      metadata: {
        speciesCode: 'clcrob',
        media: {
          photoUrl: '/photos/clcrob.jpg',
          squarePhotoUrl: '/photos/clcrob-square.jpg',
          photoAttribution: '(c) Local observer',
        },
      },
    }]);

  });

  test('generateBirdIngestData writes birds.json from source files', async () => {
    const externalDataDir = await mkdtemp(path.join(os.tmpdir(), 'bird-source-'));
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'bird-output-'));

    await writeFile(path.join(externalDataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      gretti1: {
        sciName: 'Tinamus major',
        comName: 'Great Tinamou',
        speciesCode: 'gretti1',
        familyComName: 'Tinamous',
        familySciName: 'Tinamidae',
      },
    }));
    await writeFile(path.join(externalDataDir, 'inaturalist-costa-rica-bird-images.json'), JSON.stringify({
      gretti1: {
        speciesCode: 'gretti1',
        photo: '/great-tinamou.jpg',
        squarePhoto: '/great-tinamou-square.jpg',
        attribution: '(c) Great Photo Person',
        wikiTitle: 'Great_tinamou',
        extract: 'A small tinamou.',
      },
    }));
    await writeFile(path.join(externalDataDir, 'ebird-recent-observations-cr.json'), JSON.stringify({
      gretti1: {
        locations: ['Forest Trail'],
        obsDt: '2026-05-21 05:10',
        howMany: 2,
        lat: 9.1,
        lng: -84.2,
      },
    }));
    await writeFile(path.join(externalDataDir, 'xenocanto-costa-rica-bird-songs.json'), JSON.stringify({
      'Great Tinamou': {
        file: 'https://xeno-canto.org/456/download',
        sono: 'https://xeno-canto.org/sounds/spectrograms/example-456.png',
        length: '1:12',
        rec: 'Paul Driver',
        cnt: 'Costa Rica',
      },
    }));

    const result = await generateBirdIngestData({
      externalDataDir,
      outputDir,
    });
    const generated = JSON.parse(await readFile(path.join(outputDir, 'birds.json'), 'utf8'));

    expect(result).toMatchObject({
      dataset: 'birds',
      outputPath: path.join(outputDir, 'birds.json'),
      count: 1,
      fetchedDescriptionCount: 1,
      reusedDescriptionCount: 0,
    });
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      externalId: 'bird-gretti1',
      name: 'Great Tinamou',
      description: 'A small tinamou.',
      metadata: {
        speciesCode: 'gretti1',
        scientificName: 'Tinamus major',
        media: {
          photoUrl: '/great-tinamou.jpg',
          squarePhotoUrl: '/great-tinamou-square.jpg',
          photoAttribution: '(c) Great Photo Person',
          wikiTitle: 'Great_tinamou',
          songLength: '1:12',
          songAttributionHtml: null,
        },
      },
    });
  });

  test('generateBirdIngestData incrementally updates existing birds.json', async () => {
    const externalDataDir = await mkdtemp(path.join(os.tmpdir(), 'bird-source-'));
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'bird-output-'));
    const outputPath = path.join(outputDir, 'birds.json');
    await writeFile(outputPath, JSON.stringify([
      {
        speciesCode: 'gretti1',
        description: 'Cached tinamou description.',
      },
    ]));
    await writeFile(path.join(externalDataDir, 'ebird-species-taxo-cr.json'), JSON.stringify({
      gretti1: {
        sciName: 'Tinamus major',
        comName: 'Great Tinamou',
        speciesCode: 'gretti1',
        familyComName: 'Tinamous',
        familySciName: 'Tinamidae',
      },
      higtin1: {
        sciName: 'Nothocercus bonapartei',
        comName: 'Highland Tinamou',
        speciesCode: 'higtin1',
        familyComName: 'Tinamous',
        familySciName: 'Tinamidae',
      },
    }));
    await writeFile(path.join(externalDataDir, 'inaturalist-costa-rica-bird-images.json'), JSON.stringify({
      higtin1: {
        speciesCode: 'higtin1',
        photo: 'https://example.test/highland-tinamou.jpg',
        wikiTitle: 'Highland_tinamou',
        extract: 'A second description.',
      },
    }));
    await writeFile(path.join(externalDataDir, 'ebird-recent-observations-cr.json'), JSON.stringify({}));
    await writeFile(path.join(externalDataDir, 'xenocanto-costa-rica-bird-songs.json'), JSON.stringify({}));

    await expect(generateBirdIngestData({
      externalDataDir,
      outputDir,
    })).resolves.toMatchObject({
      count: 2,
      fetchedDescriptionCount: 1,
      reusedDescriptionCount: 1,
    });

    const generated = JSON.parse(await readFile(outputPath, 'utf8'));

    expect(generated).toHaveLength(2);
    expect(generated[0]).toMatchObject({
      externalId: 'bird-gretti1',
      description: 'Cached tinamou description.',
      metadata: {
        speciesCode: 'gretti1',
      },
    });
    expect(generated[1]).toMatchObject({
      externalId: 'bird-higtin1',
      description: 'A second description.',
      metadata: {
        speciesCode: 'higtin1',
      },
    });
  });
});
