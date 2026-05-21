import { mkdir } from 'fs/promises';
import path from 'path';
import {
  COSTA_RICA_COUNTRY_CODE,
  EXTERNAL_PROVIDERS,
  EXTERNAL_RESOURCES,
  YEAR_MS,
  buildJsonFileName,
  isIsoDateFresh,
  readJsonFileOrDefault,
  toIsoDateOnly,
  writeJsonFile,
} from '../utils/export.utils.js';
import {
  normalizeLicense,
} from '../utils/license.utils.js';
import MediaAssetUploadService from './mediaAsset.service.js';
import WikiExportService from './wiki.service.js';
import logger from '../../utils/logger.js';

const INATURALIST_PROVIDER = EXTERNAL_PROVIDERS.inaturalist;

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
  const normalizedAttribution = normalizeINaturalistAttribution(attribution);
  const normalizedLicense = normalizeINaturalistLicense(attribution);

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

function normalizeINaturalistAttribution(attribution) {
  const value = String(attribution || '').trim();

  return value || null;
}

function normalizeINaturalistExtract(extract) {
  const value = String(extract || '').trim();

  return value || null;
}

function normalizeINaturalistLicense(attribution) {
  return normalizeLicense(attribution);
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

function normalizeINaturalistExportedPhotoPath(key) {
  const value = String(key || '').trim().replace(/^\/+/, '');

  return value ? `/${value}` : null;
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

  const exportedPath = normalizeINaturalistExportedPhotoPath(key);

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

  const attribution = normalizeINaturalistAttribution(photo.attribution);
  const license = photo.license || normalizeINaturalistLicense(attribution);
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
    ...(normalizeINaturalistExtract(photo.extract) ? { extract: normalizeINaturalistExtract(photo.extract) } : {}),
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
  const attribution = normalizeINaturalistAttribution(photo.attribution);
  const license = photo.license || normalizeINaturalistLicense(attribution);
  const squarePhoto = String(photo.squarePhoto || '').trim();
  const wikiTitle = normalizeWikipediaTitle(photo.wikiTitle);
  const extract = normalizeINaturalistExtract(photo.extract);
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
  if (!photo || normalizeINaturalistExtract(photo.extract)) {
    return photo;
  }

  const wikiTitle = normalizeWikipediaTitle(photo.wikiTitle);

  if (!wikiTitle || !options.wikiService) {
    return photo;
  }

  try {
    const extract = normalizeINaturalistExtract(await options.wikiService.getBirdDescription(wikiTitle, {
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

class INaturalistExportService {
  constructor(options = {}) {
    this.dataDir = options.dataDir;
    this.iNaturalistClient = options.iNaturalistClient;
    this.mediaAssetService = options.mediaAssetService;
    this.wikiService = options.wikiService;
    this.now = options.now || (() => Date.now());
  }

  getMediaAssetService() {
    if (!this.mediaAssetService) {
      this.mediaAssetService = new MediaAssetUploadService();
    }

    return this.mediaAssetService;
  }

  getWikiService() {
    if (!this.wikiService) {
      this.wikiService = new WikiExportService({
        dataDir: this.dataDir,
        now: this.now,
      });
    }

    return this.wikiService;
  }

  async export(options = {}) {
    await mkdir(this.dataDir, { recursive: true });

    return this.exportCostaRicaBirdImages(options);
  }

  async exportCostaRicaBirdImages(options = {}) {
    const countryCode = options.countryCode || COSTA_RICA_COUNTRY_CODE;
    const taxonomyFilePath = options.taxonomyFilePath || path.join(
      this.dataDir,
      buildJsonFileName('ebird', 'species', 'taxo', countryCode)
    );
    const filePath = options.filePath || path.join(
      this.dataDir,
      buildJsonFileName('inaturalist', 'costa', 'rica', 'bird', 'images')
    );
    const taxonomyBySpeciesCode = await readJsonFileOrDefault(taxonomyFilePath, {});
    const taxonomyEntries = taxonomyEntriesBySpeciesCode(taxonomyBySpeciesCode);
    const existingPayload = await readJsonFileOrDefault(filePath, {});
    const updates = {
      ...(existingPayload.updates || {}),
    };
    const photosBySpeciesCode = imageEntriesBySpeciesCode(existingPayload);
    const today = toIsoDateOnly(this.now());
    let fetchedCount = 0;
    let skippedCount = 0;

    for (const taxonomyEntry of taxonomyEntries) {
      const existingPhoto = photosBySpeciesCode.get(taxonomyEntry.speciesCode);
      const lastUpdate = updates[taxonomyEntry.speciesCode] || existingPhoto?.['lastUpdate'];

      if (
        !options.force
        && isIsoDateFresh(lastUpdate, YEAR_MS, { now: this.now() })
      ) {
        const normalizedExistingPhoto = await normalizeINaturalistPhotoForExport(existingPhoto, {
          existingPhoto,
          mediaAssetService: this.getMediaAssetService(),
          signal: options.signal,
        });

        if (normalizedExistingPhoto) {
          photosBySpeciesCode.set(
            taxonomyEntry.speciesCode,
            await enrichINaturalistPhotoExtract(normalizedExistingPhoto, {
              wikiService: this.getWikiService(),
              signal: options.signal,
            })
          );
        }

        skippedCount += 1;
        continue;
      }

      const response = await this.iNaturalistClient.searchTaxaByName(taxonomyEntry.comName, {
        signal: options.signal,
      });
      const photo = findMatchingINaturalistPhoto(response, taxonomyEntry.comName);
      updates[taxonomyEntry.speciesCode] = today;
      fetchedCount += 1;

      if (photo) {
        const match = findMatchingINaturalistTaxon(response, taxonomyEntry.comName);
        const photoEntry = await normalizeINaturalistPhotoForExport({
          speciesCode: taxonomyEntry.speciesCode,
          ...photo,
          'lastUpdate': today,
        }, {
          existingPhoto,
          mediaAssetService: this.getMediaAssetService(),
          signal: options.signal,
        });

        const wikiTitle = normalizeWikipediaTitle(match?.wikipedia_url);

        if (photoEntry && wikiTitle) {
          photoEntry.wikiTitle = wikiTitle;
        }

        if (photoEntry) {
          photosBySpeciesCode.set(
            taxonomyEntry.speciesCode,
            await enrichINaturalistPhotoExtract(photoEntry, {
              wikiService: this.getWikiService(),
              signal: options.signal,
            })
          );
        } else {
          photosBySpeciesCode.delete(taxonomyEntry.speciesCode);
        }
      } else {
        photosBySpeciesCode.delete(taxonomyEntry.speciesCode);
      }

      await writeJsonFile(filePath, buildImagePayload(taxonomyEntries, photosBySpeciesCode));
    }

    const payload = buildImagePayload(taxonomyEntries, photosBySpeciesCode);

    await writeJsonFile(filePath, payload);

    return {
      provider: INATURALIST_PROVIDER,
      resource: EXTERNAL_RESOURCES.costaRicaBirdImages,
      filePath,
      skipped: false,
      count: Object.keys(payload).length,
      fetchedCount,
      skippedCount,
    };
  }
}

export {
  buildImagePayload,
  buildINaturalistImageAssetKey,
  INaturalistExportService,
  findMatchingINaturalistPhoto,
  findMatchingINaturalistTaxon,
  imageEntriesBySpeciesCode,
  normalizeINaturalistPhotoForExport,
  normalizeINaturalistAttribution,
  normalizeINaturalistLicense,
  normalizeINaturalistPhotoPath,
  normalizeWikipediaTitle,
  taxonomyEntriesBySpeciesCode,
};
export default INaturalistExportService;
