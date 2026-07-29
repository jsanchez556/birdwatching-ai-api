import path from 'path';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import { mergeTags } from '../../utils/array.utils.js';
import {
  readJsonFileOrDefault,
  writeJsonFile,
} from '../../utils/fs.utils.js';
import { escapeHtml } from '../../utils/html.utils.js';
import { normalizeLicense } from '../../utils/license.utils.js';
import {
  baseNameFromUrl,
  normalizeExportedMediaPath,
  normalizeMediaPath,
  resolveMediaUrl,
} from '../../utils/file.utils.js';
import {
  normalizeLocationEntry,
  omitUndefinedValues,
  sortRecentLocationEntries,
} from '../../utils/location.utils.js';
import {
  normalizeNumberOrNull,
  normalizeText,
  parseDateTime,
} from '../../utils/normalizer.utils.js';
import { areTextsSimilar, normalizeTextExtract } from '../../utils/text.utils.js';
const EBIRD_TAXONOMY_CHUNK_SIZE = 50;
const DEFAULT_XENO_CANTO_AUDIO_EXTENSION = '.mp3';
const EXTERNAL_PROVIDERS = {
  ebird: 'ebird',
  inaturalist: 'inaturalist',
  xenocanto: 'xenocanto',
};
const EXTERNAL_RESOURCES = {
  costaRicaBirdImages: 'costa-rica-bird-images',
  costaRicaBirdSongs: 'costa-rica-bird-songs',
};
const INATURALIST_PROVIDER = EXTERNAL_PROVIDERS.inaturalist;
const XENO_CANTO_PROVIDER = EXTERNAL_PROVIDERS.xenocanto;
const XENO_CANTO_RESOURCE = EXTERNAL_RESOURCES.costaRicaBirdSongs;

const normalizeCoordinate = normalizeNumberOrNull;

function normalizeObservationEntry(observation, defaults = {}) {
  if (typeof observation === 'string') {
    return {
      locId: defaults.locId || null,
      locName: observation,
      obsDt: defaults.obsDt || null,
      howMany: defaults.howMany ?? null,
      lat: normalizeCoordinate(defaults.lat),
      lng: normalizeCoordinate(defaults.lng),
    };
  }

  return {
    ...observation,
    obsDt: observation?.obsDt || defaults.obsDt || null,
    lat: normalizeCoordinate(observation?.lat ?? defaults.lat),
    lng: normalizeCoordinate(observation?.lng ?? defaults.lng),
  };
}

function normalizeObservationList(observations) {
  if (observations?.locations) {
    return observations.locations.map((location) => normalizeObservationEntry(location, {
      obsDt: observations.lstDt || observations.obsDt || null,
    }));
  }

  if (Array.isArray(observations)) {
    return observations.filter(Boolean).map((observation) => normalizeObservationEntry(observation));
  }

  return observations ? [normalizeObservationEntry(observations)] : [];
}

function normalizeXenoCantoObservation(song) {
  if (!song?.loc) {
    return null;
  }

  return {
    locId: null,
    locName: song.loc,
    obsDt: song.date || null,
    howMany: null,
    lat: normalizeCoordinate(song.lat),
    lng: normalizeCoordinate(song.lon),
  };
}

function locationKey(observation) {
  return String(observation?.locName || observation?.location || observation?.locations?.[0] || '')
    .trim()
    .toLowerCase();
}

function uniqueObservations(observations) {
  const seen = new Set();

  return observations.filter((observation) => {
    const key = locationKey(observation);

    if (!key) {
      return true;
    }

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function includeExtraObservations(observations, extraObservations) {
  const includedKeys = new Set(observations.map(locationKey).filter(Boolean));
  const additions = [];

  for (const observation of extraObservations) {
    const key = locationKey(observation);

    if (!key || includedKeys.has(key)) {
      continue;
    }

    includedKeys.add(key);
    additions.push(observation);
  }

  return [...observations, ...additions];
}

function selectLatestObservation(observations) {
  const observationList = normalizeObservationList(observations);

  return observationList
    .filter(Boolean)
    .sort((left, right) => parseDateTime(right?.obsDt) - parseDateTime(left?.obsDt))[0] || null;
}

function normalizeLastObservation(observation) {
  if (!observation) {
    return null;
  }

  return {
    locId: observation.locId || null,
    locName: observation.locName || observation.location || observation.locations?.[0] || null,
    obsDt: observation.obsDt || null,
    howMany: observation.howMany ?? null,
    lat: normalizeCoordinate(observation.lat),
    lng: normalizeCoordinate(observation.lng),
  };
}

function normalizeRecentObservations(observations, options = {}) {
  const limit = options.limit || 5;
  const extraObservations = Array.isArray(options.extraObservations)
    ? options.extraObservations.filter(Boolean)
    : [];
  const observationList = uniqueObservations([
    ...normalizeObservationList(observations),
    ...extraObservations,
  ])
    .filter(Boolean)
    .sort((left, right) => parseDateTime(right?.obsDt) - parseDateTime(left?.obsDt));
  const selectedObservations = includeExtraObservations(
    observationList.slice(0, limit),
    extraObservations
  );
  const locations = selectedObservations.map((observation) => ({
    locId: observation.locId || null,
    locName: observation.locName || observation.location || observation.locations?.[0] || null,
    obsDt: observation.obsDt || null,
    howMany: observation.howMany ?? null,
    lat: normalizeCoordinate(observation.lat),
    lng: normalizeCoordinate(observation.lng),
  }));

  return {
    lastObservedAt: locations[0]?.obsDt || null,
    locationCount: observationList.length,
    locations,
  };
}

function normalizeSong(song) {
  if (!song) {
    return {
      song: null,
      sono: null,
      songLength: null,
      songAttributionHtml: null,
    };
  }

  return {
    song: song.file || null,
    sono: song.sono || null,
    songLength: song.length || null,
    songAttributionHtml: song.attr_html || null,
  };
}

function buildMedia(image, song) {
  return {
    photo: image?.photo || null,
    squarePhoto: image?.squarePhoto || null,
    photoAttribution: image?.attribution || null,
    wikiTitle: image?.wikiTitle || null,
    ...normalizeSong(song),
  };
}

function getDocumentSpeciesCode(document) {
  return document?.metadata?.speciesCode || document?.speciesCode || null;
}

function getDocumentDescription(document) {
  return document?.description || document?.metadata?.description || null;
}

function getDocumentMetadata(document) {
  return document?.metadata && typeof document.metadata === 'object' ? document.metadata : {};
}

function getDocumentLocations(document) {
  if (Array.isArray(document?.locations)) {
    return document.locations;
  }

  const metadata = getDocumentMetadata(document);
  const recentLocations = metadata.recentObservations?.locations
    ?.map((observation) => observation?.locName)
    .filter(Boolean);

  if (recentLocations?.length) {
    return recentLocations;
  }

  return [];
}

function documentsBySpeciesCode(documents = []) {
  return new Map(
    documents
      .map((document) => [getDocumentSpeciesCode(document), document])
      .filter(([speciesCode]) => speciesCode)
  );
}

function hasDescription(document) {
  const description = getDocumentDescription(document);

  return typeof description === 'string' && description.trim().length > 0;
}

function getDescription(image, existingDocument, options = {}) {
  const extract = normalizeText(image?.extract);

  if (extract) {
    return extract;
  }

  if (!options.forceDescriptions && hasDescription(existingDocument)) {
    return getDocumentDescription(existingDocument);
  }

  return null;
}

function mergeMedia(primaryMedia = {}, fallbackMedia = {}) {
  return {
    photoUrl: primaryMedia.photoUrl ?? fallbackMedia.photoUrl ?? null,
    squarePhotoUrl: primaryMedia.squarePhotoUrl ?? fallbackMedia.squarePhotoUrl ?? null,
    photoAttribution: primaryMedia.photoAttribution ?? fallbackMedia.photoAttribution ?? null,
    wikiTitle: primaryMedia.wikiTitle ?? fallbackMedia.wikiTitle ?? null,
    songUrl: primaryMedia.songUrl ?? fallbackMedia.songUrl ?? null,
    sonogramUrl: primaryMedia.sonogramUrl ?? fallbackMedia.sonogramUrl ?? null,
    songLength: primaryMedia.songLength ?? fallbackMedia.songLength ?? null,
    songAttributionHtml: primaryMedia.songAttributionHtml ?? fallbackMedia.songAttributionHtml ?? null,
  };
}

function toBirdProfileDocument(bird, options = {}) {
  const {
    sciName,
    comName,
    speciesCode,
    familyComName,
    familySciName,
    description,
    lastObservation,
    recentObservations,
    media,
  } = bird;
  const existingDocument = options.existingDocument || null;
  const existingMetadata = getDocumentMetadata(existingDocument);
  const observationLocations = recentObservations?.locations
    ?.map((observation) => observation.locName)
    .filter(Boolean) || [];
  const locations = mergeTags(observationLocations, getDocumentLocations(existingDocument));
  const normalizedMedia = {
    photoUrl: media.photo,
    squarePhotoUrl: media.squarePhoto,
    photoAttribution: media.photoAttribution,
    wikiTitle: media.wikiTitle,
    songUrl: media.song,
    sonogramUrl: media.sono,
    songLength: media.songLength,
    songAttributionHtml: media.songAttributionHtml,
  };

  return {
    externalId: `bird-${speciesCode}`,
    name: comName,
    family: familyComName,
    description,
    locations,
    documentType: 'bird_profile',
    category: familyComName,
    tags: mergeTags([comName, sciName, speciesCode, familyComName], existingDocument?.tags),
    metadata: {
      ...existingMetadata,
      speciesCode,
      scientificName: sciName,
      familyScientificName: familySciName,
      lastObservation: lastObservation || existingMetadata.lastObservation || null,
      recentObservations: recentObservations || existingMetadata.recentObservations || null,
      media: mergeMedia(normalizedMedia, existingMetadata.media),
    },
  };
}

async function buildBirdDocument(speciesCode, taxonomy, sourceData, options = {}) {
  const bird = {
    sciName: taxonomy?.sciName || null,
    comName: taxonomy?.comName || null,
    speciesCode: taxonomy?.speciesCode || speciesCode,
    familyComName: taxonomy?.familyComName || null,
    familySciName: taxonomy?.familySciName || null,
  };
  const image = sourceData.images?.[speciesCode] || null;
  const observationSource = sourceData.observations?.[speciesCode];
  const observation = selectLatestObservation(observationSource);
  const song = sourceData.songs?.[bird.comName] || null;
  const existingDocument = options.existingDocumentsBySpeciesCode?.get(bird.speciesCode) || null;

  return toBirdProfileDocument({
    ...bird,
    description: getDescription(image, existingDocument, options),
    lastObservation: normalizeLastObservation(observation),
    recentObservations: normalizeRecentObservations(observationSource, {
      extraObservations: [normalizeXenoCantoObservation(song)],
    }),
    media: buildMedia(image, song),
  }, {
    existingDocument,
  });
}

async function buildBirdDocuments(sourceData, options = {}) {
  const documents = [];
  const existingDocumentsBySpeciesCode = options.existingDocumentsBySpeciesCode
    || documentsBySpeciesCode(options.existingDocuments);

  for (const [speciesCode, taxonomy] of Object.entries(sourceData.taxonomy || {})) {
    const document = await buildBirdDocument(speciesCode, taxonomy, sourceData, {
      ...options,
      existingDocumentsBySpeciesCode,
    });

    documents.push(document);

    if (options.onDocument) {
      await options.onDocument(document, documents);
    }
  }

  return documents;
}

function isObservationMoreRecent(candidate, current) {
  if (!current) {
    return true;
  }

  const candidateTimestamp = Date.parse(candidate.replace(' ', 'T'));
  const currentTimestamp = Date.parse(current.replace(' ', 'T'));

  if (!Number.isNaN(candidateTimestamp) && !Number.isNaN(currentTimestamp)) {
    return candidateTimestamp > currentTimestamp;
  }

  return candidate.localeCompare(current) > 0;
}

function normalizeTaxonomyEntries(entries) {
  const taxonomyBySpeciesCode = {};

  for (const entry of entries || []) {
    if (!entry?.speciesCode) {
      continue;
    }

    taxonomyBySpeciesCode[entry.speciesCode] = {
      sciName: entry.sciName,
      comName: entry.comName,
      speciesCode: entry.speciesCode,
      familyComName: entry.familyComName,
      familySciName: entry.familySciName,
    };
  }

  return taxonomyBySpeciesCode;
}

function areObservationLocationsSimilar(candidate, current) {
  if (candidate.locId && current.locId) {
    return candidate.locId === current.locId;
  }

  return areTextsSimilar(candidate.locName, current.locName);
}

function mergeObservationLocation(locations, location) {
  if (!location?.obsDt) {
    return locations;
  }

  const nextLocations = [...locations];
  const matchingIndex = nextLocations.findIndex((currentLocation) => (
    areObservationLocationsSimilar(location, currentLocation)
  ));

  if (matchingIndex >= 0) {
    const currentLocation = nextLocations[matchingIndex];
    nextLocations[matchingIndex] = isObservationMoreRecent(location.obsDt, currentLocation.obsDt)
      ? location
      : currentLocation;
  } else {
    nextLocations.push(location);
  }

  return sortRecentLocationEntries(nextLocations);
}

function toRecentObservationSummary(locations = []) {
  const sortedLocations = sortRecentLocationEntries(locations).map(omitUndefinedValues);

  return {
    locations: sortedLocations,
    lstDt: sortedLocations[0]?.obsDt || null,
  };
}

function summarizeRecentObservations(observations, fallbackSpeciesCode = null) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return fallbackSpeciesCode
      ? {
        [fallbackSpeciesCode]: toRecentObservationSummary(),
      }
      : {};
  }

  const observationsBySpecies = new Map();

  for (const observation of observations) {
    const speciesCode = observation?.speciesCode || fallbackSpeciesCode;

    if (!speciesCode) {
      continue;
    }

    const location = normalizeLocationEntry(observation);

    if (location) {
      const locations = observationsBySpecies.get(speciesCode) || [];
      observationsBySpecies.set(speciesCode, mergeObservationLocation(locations, location));
    }
  }

  if (fallbackSpeciesCode && !observationsBySpecies.has(fallbackSpeciesCode)) {
    observationsBySpecies.set(fallbackSpeciesCode, []);
  }

  return Object.fromEntries([...observationsBySpecies.entries()]
    .map(([speciesCode, locations]) => [speciesCode, toRecentObservationSummary(locations)]));
}

function normalizeExistingRecentObservations(payload) {
  if (Array.isArray(payload)) {
    return summarizeRecentObservations(payload);
  }

  return Object.fromEntries(
    Object.entries(payload || {})
      .map(([speciesCode, observation]) => {
        const rawLocations = Array.isArray(observation?.locations)
          ? observation.locations
          : [];
        const locations = rawLocations
          .map((location) => normalizeLocationEntry(location, observation))
          .filter(Boolean);

        return [speciesCode, toRecentObservationSummary(locations)];
      })
  );
}

function mergeRecentObservationSummaries(existingPayload, freshPayload) {
  const merged = {
    ...normalizeExistingRecentObservations(existingPayload),
  };

  for (const [speciesCode, freshObservation] of Object.entries(freshPayload || {})) {
    const existingObservation = merged[speciesCode];

    if (!existingObservation) {
      merged[speciesCode] = freshObservation;
      continue;
    }

    let locations = [...(existingObservation.locations || [])];

    for (const location of freshObservation.locations || []) {
      locations = mergeObservationLocation(locations, location);
    }

    merged[speciesCode] = toRecentObservationSummary(locations);
  }

  return merged;
}

function taxonomyEntriesBySpeciesCode(taxonomyBySpeciesCode) {
  return Object.entries(taxonomyBySpeciesCode || {})
    .map(([speciesCode, taxonomy]) => ({
      speciesCode,
      comName: taxonomy?.comName,
    }))
    .filter((entry) => entry.speciesCode && entry.comName);
}

function findMatchingINaturalistTaxon(response, comName) {
  const results = response?.results || [];
  const match = results.find((result) => result?.matched_term === comName);

  if (match) {
    return match;
  }

  if (results.some((result) => result?.matched_term)) {
    return null;
  }

  return results[0] || null;
}

function findMatchingINaturalistPhoto(response, comName) {
  const match = findMatchingINaturalistTaxon(response, comName);
  const {
    attribution,
    medium_url: photo,
    square_url: squarePhoto,
  } = match?.default_photo || {};
  const normalizedAttribution = normalizeTextExtract(attribution);
  const normalizedLicense = normalizeLicense(attribution);

  if (!normalizeINaturalistPhotoPath(photo)) {
    return null;
  }

  return {
    ...(normalizedAttribution ? { attribution: normalizedAttribution } : {}),
    ...(normalizedLicense ? { license: normalizedLicense } : {}),
    photo,
    ...(normalizeINaturalistPhotoPath(squarePhoto) ? { squarePhoto } : {}),
  };
}

function normalizeINaturalistPhotoPath(photoUrl) {
  const value = String(photoUrl || '').trim();

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const photosIndex = url.pathname.indexOf('/photos/');

    if (photosIndex === -1) {
      return value;
    }

    return url.pathname.slice(photosIndex + '/photos'.length);
  } catch {
    return value;
  }
}

function resolveINaturalistPhotoUrl(photoUrl) {
  const value = String(photoUrl || '').trim();

  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function buildINaturalistImageAssetKey(photoUrl) {
  const assetUrl = resolveINaturalistPhotoUrl(photoUrl);

  if (!assetUrl) {
    return null;
  }

  const url = new URL(assetUrl);
  const segments = url.pathname.split('/').filter(Boolean);
  const photosIndex = segments.indexOf('photos');
  const photoId = segments[photosIndex + 1];
  const fileName = segments[photosIndex + 2];
  const extension = path.extname(fileName || '').toLowerCase();
  const variant = path.basename(fileName || '', extension);

  if (photosIndex === -1 || !photoId || !variant || !extension) {
    return null;
  }

  return `photos/${photoId}_${variant}${extension}`;
}

async function uploadINaturalistImageAsset(photoUrl, options = {}) {
  const assetUrl = resolveINaturalistPhotoUrl(photoUrl);
  const key = buildINaturalistImageAssetKey(assetUrl);

  if (!assetUrl || !key) {
    return {
      url: normalizeINaturalistPhotoPath(photoUrl),
    };
  }

  const exportedPath = normalizeExportedMediaPath(key);

  if (options.existingValue === key || options.existingValue === exportedPath) {
    return {
      url: exportedPath,
      uploaded: true,
    };
  }

  if (!options.mediaAssetService) {
    return {
      url: exportedPath,
    };
  }

  const result = await options.mediaAssetService.uploadImageFromUrl(assetUrl, {
    provider: INATURALIST_PROVIDER,
    key,
    license: options.license,
    signal: options.signal,
  });

  if (result?.uploaded === false) {
    return {
      url: result.hotlinkUrl || assetUrl,
      uploaded: false,
    };
  }

  return {
    url: exportedPath,
    uploaded: true,
  };
}

async function normalizeINaturalistPhotoForExport(photo, options = {}) {
  if (!photo?.photo) {
    return null;
  }

  const attribution = normalizeTextExtract(photo.attribution);
  const license = photo.license || normalizeLicense(attribution);
  const normalizedPhoto = await uploadINaturalistImageAsset(photo.photo, {
    license,
    mediaAssetService: options.mediaAssetService,
    existingValue: options.existingPhoto?.photo,
    signal: options.signal,
  });
  const normalizedSquarePhoto = await uploadINaturalistImageAsset(photo.squarePhoto, {
    license,
    mediaAssetService: options.mediaAssetService,
    existingValue: options.existingPhoto?.squarePhoto,
    signal: options.signal,
  });

  if (!normalizedPhoto?.url) {
    return null;
  }

  return {
    speciesCode: photo.speciesCode,
    ...(attribution ? { attribution } : {}),
    photo: normalizedPhoto.url,
    ...(normalizedSquarePhoto?.url ? { squarePhoto: normalizedSquarePhoto.url } : {}),
    ...(normalizedPhoto.uploaded === true ? { uploaded: true } : {}),
    ...(photo['lastUpdate'] ? { 'lastUpdate': photo['lastUpdate'] } : {}),
    ...(photo.wikiTitle ? { wikiTitle: normalizeWikipediaTitle(photo.wikiTitle) } : {}),
    ...(normalizeTextExtract(photo.extract) ? { extract: normalizeTextExtract(photo.extract) } : {}),
  };
}

function normalizeWikipediaTitle(wikipediaUrl) {
  const value = String(wikipediaUrl || '').trim();

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const title = url.pathname.split('/').filter(Boolean).pop();

    return title || null;
  } catch {
    return value;
  }
}

function mapImageEntry(speciesCode, photo, lastUpdate) {
  const attribution = normalizeTextExtract(photo.attribution);
  const license = photo.license || normalizeLicense(attribution);
  const squarePhoto = String(photo.squarePhoto || '').trim();
  const wikiTitle = normalizeWikipediaTitle(photo.wikiTitle);
  const extract = normalizeTextExtract(photo.extract);
  const entry = {
    speciesCode: photo.speciesCode,
    ...(attribution ? { attribution } : {}),
    ...(license ? { license } : {}),
    photo: String(photo.photo || '').trim(),
    ...(squarePhoto ? { squarePhoto } : {}),
    ...(photo.uploaded === true ? { uploaded: true } : {}),
    ...(lastUpdate ? { 'lastUpdate': lastUpdate } : {}),
    ...(wikiTitle ? { wikiTitle } : {}),
    ...(extract ? { extract } : {}),
  };

  return [speciesCode, entry];
}

async function enrichINaturalistPhotoExtract(photo, options = {}) {
  if (!photo || normalizeTextExtract(photo.extract)) {
    return photo;
  }

  const wikiTitle = normalizeWikipediaTitle(photo.wikiTitle);

  if (!wikiTitle || !options.wikiService) {
    return photo;
  }

  try {
    const extract = normalizeTextExtract(await options.wikiService.getBirdDescription(wikiTitle, {
      signal: options.signal,
    }));

    return extract
      ? {
        ...photo,
        extract,
      }
      : photo;
  } catch (error) {
    logger.warn('iNaturalist Wikipedia extract lookup failed', {
      provider: INATURALIST_PROVIDER,
      speciesCode: photo.speciesCode,
      wikiTitle,
      error: error.message,
    });

    return photo;
  }
}

function imageEntriesBySpeciesCode(payload) {
  if (!payload || Array.isArray(payload)) {
    return new Map();
  }

  if (Array.isArray(payload.photos)) {
    return new Map(
      payload.photos
        .filter((photo) => photo?.speciesCode)
        .map((photo) => mapImageEntry(
          photo.speciesCode,
          photo,
          payload.updates?.[photo.speciesCode] || photo['lastUpdate']
        ))
    );
  }

  return new Map(
    Object.entries(payload)
      .filter(([, photo]) => photo?.speciesCode)
      .map(([speciesCode, photo]) => mapImageEntry(speciesCode, photo, photo['lastUpdate']))
  );
}

function buildImagePayload(taxonomyEntries, photosBySpeciesCode) {
  return Object.fromEntries(
    taxonomyEntries
      .map((taxonomyEntry) => photosBySpeciesCode.get(taxonomyEntry.speciesCode))
      .filter(Boolean)
      .map((photo) => [photo.speciesCode, photo])
  );
}

function xenoCantoExportResult(filePath, overrides = {}) {
  return {
    provider: XENO_CANTO_PROVIDER,
    resource: XENO_CANTO_RESOURCE,
    filePath,
    ...overrides,
  };
}

async function normalizeXenoCantoRecordingForExport(recording, options = {}) {
  const license = normalizeLicense(recording?.lic || recording?.license);
  const file = await uploadXenoCantoAsset(recording, options, {
    exportField: 'file',
    assetType: 'audio',
    uploadMethod: 'uploadAudioFromUrl',
    source: recording?.file,
    key: buildXenoCantoAudioAssetName(recording),
    fallback: recording?.file ? normalizeMediaPath(recording.file) : null,
    skipMessage: 'Xeno-canto audio upload skipped because exported asset already exists',
  });
  const sonogram = await uploadXenoCantoAsset(recording, options, {
    exportField: 'sono',
    assetType: 'image',
    uploadMethod: 'uploadImageFromUrl',
    source: smallSonogramFromRecording(recording),
    key: buildXenoCantoSonogramAssetName(recording),
    fallback: typeof recording?.sono === 'string' ? normalizeMediaPath(recording.sono) : null,
    skipMessage: 'Xeno-canto sonogram upload skipped because exported asset already exists',
  });
  const attrHtml = recording.attr_html && !recording.rec && !recording.lic
    ? recording.attr_html
    : buildXenoCantoAttributionHtml(recording);

  return {
    gen: recording.gen,
    sp: recording.sp,
    ssp: recording.ssp || '',
    en: recording.en,
    cnt: recording.cnt,
    loc: recording.loc,
    ...(recording.lat ? { lat: recording.lat } : {}),
    ...(recording.lon ? { lon: recording.lon } : {}),
    ...(recording.date ? { date: recording.date } : {}),
    ...(recording.length ? { length: recording.length } : {}),
    ...(file?.value ? { file: file.value } : {}),
    ...(sonogram?.value ? { sono: sonogram.value } : {}),
    ...(file?.uploaded === true ? { uploaded: true } : {}),
    ...(attrHtml ? { attr_html: attrHtml } : {}),
  };
}

function buildXenoCantoAttributionHtml(recording) {
  const recorder = normalizeText(recording?.rec);
  const location = normalizeText(recording?.loc);
  const country = normalizeText(recording?.cnt);
  const licenseUrl = normalizeText(recording?.lic);
  const licenseName = licenseNameFromUrl(licenseUrl);
  const sourceLink = buildXenoCantoSourceLink();
  const sourceText = recorder
    ? `Sound recording by ${escapeHtml(recorder)}, sourced from ${sourceLink}`
    : `Sound recording sourced from ${sourceLink}`;
  const sentences = [];

  const recordedIn = [location, country].filter(Boolean).map(escapeHtml).join(', ');

  sentences.push(recordedIn ? `${sourceText}, recorded in ${recordedIn}.` : `${sourceText}.`);

  if (licenseUrl) {
    const licenseText = licenseName || licenseUrl;
    sentences.push(
      `Licensed under <a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(licenseText)}</a>`
    );
  }

  return `<p>${sentences.join(' ')}${sentences.at(-1)?.endsWith('.') ? '' : '.'}</p>`;
}

function buildXenoCantoSourceLink(sourceBaseUrl = env.xenoCantoApiBaseUrl) {
  const href = normalizeXenoCantoSourceUrl(sourceBaseUrl);

  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">xeno-canto</a>`;
}

function normalizeXenoCantoSourceUrl(sourceBaseUrl) {
  const value = normalizeText(sourceBaseUrl) || 'https://xeno-canto.org/';

  try {
    const url = new URL(value);
    url.pathname = '/';
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return 'https://xeno-canto.org/';
  }
}

function licenseNameFromUrl(licenseUrl) {
  const value = normalizeText(licenseUrl);

  if (!value) {
    return null;
  }

  try {
    const parts = new URL(value).pathname.split('/').filter(Boolean);
    const licenseIndex = parts.indexOf('licenses');
    const code = parts[licenseIndex + 1];
    const version = parts[licenseIndex + 2];

    if (!code || !version) {
      return null;
    }

    return `CC ${code.toUpperCase()} ${version}`;
  } catch {
    return null;
  }
}

function extensionFromXenoCantoAudio(recording) {
  const fileNameExtension = path.extname(String(recording?.['file-name'] || '').trim());

  if (fileNameExtension) {
    return fileNameExtension.toLowerCase();
  }

  const mediaUrl = normalizeText(recording?.file);

  if (mediaUrl) {
    try {
      const urlExtension = path.extname(new URL(mediaUrl, normalizeXenoCantoSourceUrl()).pathname);

      if (urlExtension && urlExtension.toLowerCase() !== '.download') {
        return urlExtension.toLowerCase();
      }
    } catch {
      const fallbackExtension = path.extname(mediaUrl);

      if (fallbackExtension && fallbackExtension.toLowerCase() !== '.download') {
        return fallbackExtension.toLowerCase();
      }
    }
  }

  return DEFAULT_XENO_CANTO_AUDIO_EXTENSION;
}

function buildXenoCantoAudioAssetName(recording) {
  const id = normalizeText(recording?.id);

  if (!id) {
    return null;
  }

  return `songs/${id}${extensionFromXenoCantoAudio(recording)}`;
}

function smallSonogramFromRecording(recording) {
  return typeof recording?.sono === 'object'
    ? recording.sono?.small
    : null;
}

function buildXenoCantoSonogramAssetName(recording) {
  const id = normalizeText(recording?.id);
  const basename = baseNameFromUrl(smallSonogramFromRecording(recording), normalizeXenoCantoSourceUrl());

  if (!id || !basename) {
    return null;
  }

  return `sonograms/${id}_${basename}`;
}

async function uploadXenoCantoAsset(recording, options = {}, asset = {}) {
  const {
    exportField,
    assetType,
    uploadMethod,
    source,
    key,
    fallback,
    skipMessage,
  } = asset;
  const assetUrl = resolveMediaUrl(source, normalizeXenoCantoSourceUrl());
  const license = recording?.license || normalizeLicense(recording?.lic);

  if (key && options.existingRecording?.[exportField] === key) {
    logger.info(skipMessage, {
      provider: XENO_CANTO_PROVIDER,
      assetType,
      key,
      recordingId: recording?.id,
    });

    return {
      value: options.existingRecording[exportField],
      uploaded: true,
    };
  }

  if (!assetUrl || !key || !options.mediaAssetService) {
    return fallback
      ? {
        value: fallback,
      }
      : null;
  }

  const result = await options.mediaAssetService[uploadMethod](assetUrl, {
    provider: XENO_CANTO_PROVIDER,
    key,
    license,
    signal: options.signal,
  });

  if (result?.uploaded === false) {
    return {
      value: result.hotlinkUrl || assetUrl,
      uploaded: false,
    };
  }

  return {
    value: key,
    uploaded: true,
  };
}

async function normalizeRecordingsByName(entries, options = {}) {
  const recordingsByName = {};

  for (const [name, recording] of entries.filter(([, entry]) => entry?.en)) {
    try {
      recordingsByName[name] = await normalizeXenoCantoRecordingForExport(recording, {
        ...options,
        existingRecording: options.existingRecordingsByName?.[name],
      });

      if (options.filePath) {
        await writeJsonFile(options.filePath, recordingsByName);
      }
    } catch (error) {
      logger.error('Xeno-canto recording export failed', {
        provider: XENO_CANTO_PROVIDER,
        recordingId: recording?.id,
        name,
        error: error.message,
      });

      throw error;
    }
  }

  return recordingsByName;
}

function recordingEntries(recordings) {
  return recordings.map((recording) => [recording?.en, recording]);
}

function uniqueSpeciesRecordingEntries(recordings) {
  const seenNames = new Set();
  const seenRecordingIds = new Set();
  const entries = [];

  for (const recording of recordings) {
    const name = normalizeText(recording?.en);
    const recordingId = normalizeText(recording?.id);

    if (!name || seenNames.has(name) || (recordingId && seenRecordingIds.has(recordingId))) {
      continue;
    }

    seenNames.add(name);

    if (recordingId) {
      seenRecordingIds.add(recordingId);
    }

    entries.push([name, recording]);
  }

  return entries;
}

async function readExistingXenoCantoExport(filePath) {
  const payload = await readJsonFileOrDefault(filePath, {});

  if (!payload || Array.isArray(payload) || Array.isArray(payload.recordings)) {
    return {};
  }

  return payload;
}


export {
  DEFAULT_XENO_CANTO_AUDIO_EXTENSION,
  EBIRD_TAXONOMY_CHUNK_SIZE,
  INATURALIST_PROVIDER,
  XENO_CANTO_PROVIDER,
  XENO_CANTO_RESOURCE,
  buildBirdDocument,
  buildBirdDocuments,
  buildImagePayload,
  buildINaturalistImageAssetKey,
  buildMedia,
  buildXenoCantoAudioAssetName,
  buildXenoCantoSonogramAssetName,
  documentsBySpeciesCode,
  enrichINaturalistPhotoExtract,
  extensionFromXenoCantoAudio,
  findMatchingINaturalistPhoto,
  findMatchingINaturalistTaxon,
  getDocumentDescription,
  getDocumentSpeciesCode,
  hasDescription,
  imageEntriesBySpeciesCode,
  mergeRecentObservationSummaries,
  normalizeCoordinate,
  normalizeINaturalistPhotoForExport,
  normalizeINaturalistPhotoPath,
  normalizeLastObservation,
  normalizeRecordingsByName,
  normalizeRecentObservations,
  normalizeSong,
  normalizeTaxonomyEntries,
  normalizeWikipediaTitle,
  normalizeXenoCantoObservation,
  normalizeXenoCantoRecordingForExport,
  normalizeXenoCantoSourceUrl,
  readExistingXenoCantoExport,
  recordingEntries,
  selectLatestObservation,
  summarizeRecentObservations,
  taxonomyEntriesBySpeciesCode,
  toBirdProfileDocument,
  uniqueSpeciesRecordingEntries,
  xenoCantoExportResult,
};
