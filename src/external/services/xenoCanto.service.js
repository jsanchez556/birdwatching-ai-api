import { mkdir } from 'fs/promises';
import path from 'path';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import MediaAssetUploadService from './mediaAsset.service.js';
import {
  DAY_MS,
  EXTERNAL_PROVIDERS,
  EXTERNAL_RESOURCES,
  buildJsonFileName,
  isFileFresh,
  readJsonFile,
  readJsonFileOrDefault,
  writeJsonFile,
} from '../utils/export.utils.js';
import {
  normalizeLicense,
} from '../utils/license.utils.js';

const DEFAULT_XENO_CANTO_AUDIO_EXTENSION = '.mp3';
const XENO_CANTO_PROVIDER = EXTERNAL_PROVIDERS.xenocanto;
const XENO_CANTO_RESOURCE = EXTERNAL_RESOURCES.costaRicaBirdSongs;

function xenoCantoExportResult(filePath, overrides = {}) {
  return {
    provider: XENO_CANTO_PROVIDER,
    resource: XENO_CANTO_RESOURCE,
    filePath,
    ...overrides,
  };
}

async function normalizeXenoCantoRecordingForExport(recording, options = {}) {
  const license = normalizeXenoCantoLicense(recording?.lic || recording?.license);
  const file = await uploadXenoCantoAsset(recording, options, {
    exportField: 'file',
    assetType: 'audio',
    uploadMethod: 'uploadAudioFromUrl',
    source: recording?.file,
    key: buildXenoCantoAudioAssetName(recording),
    fallback: recording?.file ? normalizeXenoCantoMediaPath(recording.file) : null,
    skipMessage: 'Xeno-canto audio upload skipped because exported asset already exists',
  });
  const sonogram = await uploadXenoCantoAsset(recording, options, {
    exportField: 'sono',
    assetType: 'image',
    uploadMethod: 'uploadImageFromUrl',
    source: smallSonogramFromRecording(recording),
    key: buildXenoCantoSonogramAssetName(recording),
    fallback: typeof recording?.sono === 'string' ? normalizeXenoCantoMediaPath(recording.sono) : null,
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

function normalizeXenoCantoLicense(license) {
  return normalizeLicense(license);
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

function normalizeText(value) {
  const normalized = String(value || '').trim();

  return normalized || null;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeXenoCantoMediaPath(mediaUrl) {
  const value = String(mediaUrl || '').trim();

  if (!value) {
    return null;
  }

  try {
    return new URL(value).pathname || value;
  } catch {
    return value;
  }
}

function resolveXenoCantoMediaUrl(mediaUrl) {
  const value = normalizeText(mediaUrl);

  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(value, normalizeXenoCantoSourceUrl()).toString();
    } catch {
      return null;
    }
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

function baseNameFromUrl(mediaUrl) {
  const value = normalizeText(mediaUrl);

  if (!value) {
    return null;
  }

  try {
    const basename = path.basename(new URL(value, normalizeXenoCantoSourceUrl()).pathname);

    return basename || null;
  } catch {
    const basename = path.basename(value);

    return basename || null;
  }
}

function buildXenoCantoSonogramAssetName(recording) {
  const id = normalizeText(recording?.id);
  const basename = baseNameFromUrl(smallSonogramFromRecording(recording));

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
  const assetUrl = resolveXenoCantoMediaUrl(source);
  const license = recording?.license || normalizeXenoCantoLicense(recording?.lic);

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

function namedRecordingEntries(recordingsByName) {
  return Object.entries(recordingsByName || {});
}

async function readExistingXenoCantoExport(filePath) {
  const payload = await readJsonFileOrDefault(filePath, {});

  if (!payload || Array.isArray(payload) || Array.isArray(payload.recordings)) {
    return {};
  }

  return payload;
}

class XenoCantoExportService {
  constructor(options = {}) {
    this.dataDir = options.dataDir;
    this.xenoCantoClient = options.xenoCantoClient;
    this.mediaAssetService = options.mediaAssetService;
    this.now = options.now || (() => Date.now());
  }

  getMediaAssetService() {
    if (!this.mediaAssetService) {
      this.mediaAssetService = new MediaAssetUploadService();
    }

    return this.mediaAssetService;
  }

  async export(options = {}) {
    await mkdir(this.dataDir, { recursive: true });

    return this.exportCostaRicaBirdSongs(options);
  }

  async exportCostaRicaBirdSongs(options = {}) {
    const filePath = options.filePath || path.join(
      this.dataDir,
      buildJsonFileName('xenocanto', 'costa', 'rica', 'bird', 'songs')
    );

    if (!options.force && await isFileFresh(filePath, DAY_MS * 8, { now: this.now() })) {
      const existingPayload = await readJsonFile(filePath);

      if (
        !Array.isArray(existingPayload)
        && existingPayload
        && !Array.isArray(existingPayload.recordings)
      ) {
        const recordings = await normalizeRecordingsByName(namedRecordingEntries(existingPayload), {
          mediaAssetService: this.mediaAssetService,
          signal: options.signal,
        });

        if (JSON.stringify(recordings) !== JSON.stringify(existingPayload)) {
          await writeJsonFile(filePath, recordings);

          return xenoCantoExportResult(filePath, {
            skipped: false,
            reason: 'migrated',
            count: Object.keys(recordings).length,
          });
        }

        return xenoCantoExportResult(filePath, {
          skipped: true,
          reason: 'fresh',
        });
      }

      if (Array.isArray(existingPayload)) {
        const recordings = await normalizeRecordingsByName(recordingEntries(existingPayload), {
          filePath,
          mediaAssetService: this.getMediaAssetService(),
          signal: options.signal,
        });

        return xenoCantoExportResult(filePath, {
          skipped: false,
          reason: 'migrated',
          count: Object.keys(recordings).length,
        });
      }

      if (Array.isArray(existingPayload?.recordings)) {
        const recordings = await normalizeRecordingsByName(
          recordingEntries(existingPayload.recordings),
          {
            mediaAssetService: this.getMediaAssetService(),
            filePath,
            signal: options.signal,
          }
        );

        return xenoCantoExportResult(filePath, {
          skipped: false,
          reason: 'migrated',
          count: Object.keys(recordings).length,
        });
      }
    }

    const existingRecordingsByName = await readExistingXenoCantoExport(filePath);
    const payload = await this.xenoCantoClient.getCostaRicaBirdSongs({
      perPage: options.perPage ?? 500,
      signal: options.signal,
    });
    const recordings = await normalizeRecordingsByName(
      uniqueSpeciesRecordingEntries(payload.recordings),
      {
        existingRecordingsByName,
        filePath,
        mediaAssetService: this.getMediaAssetService(),
        signal: options.signal,
      }
    );

    return xenoCantoExportResult(filePath, {
      skipped: false,
      count: Object.keys(recordings).length,
      pageCount: payload.numPages,
    });
  }
}

export {
  buildXenoCantoAudioAssetName,
  buildXenoCantoSonogramAssetName,
  extensionFromXenoCantoAudio,
  normalizeXenoCantoLicense,
  normalizeXenoCantoSourceUrl,
  normalizeXenoCantoRecordingForExport,
};
export default XenoCantoExportService;
