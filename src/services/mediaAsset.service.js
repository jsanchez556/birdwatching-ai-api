import crypto from 'crypto';
import mediaAssetsConfig from '../config/mediaAssets.json' with { type: 'json' };
import ApiRateLimiter from '../utils/rateLimiter.js';
import S3BucketService from '../storage/s3Bucket.service.js';
import logger from '../utils/logger.js';

const ASSET_TYPE_PREFIXES = {
  audio: 'audio',
  image: 'images',
};
const UPLOADABLE_MEDIA_ASSET_LICENSES = new Set(['cc-by', 'cc-by-sa']);
const RESTRICTED_MEDIA_ASSET_LICENSES = new Set([
  'cc-by-nc',
  'cc-by-nc-sa',
  'cc-by-nd',
  'cc-by-nc-nd',
  'all rights reserved',
]);

const mediaAssetDownloadRateLimiter = new ApiRateLimiter({
  maxRequests: 1,
  windowMs: 500,
});

function normalizeLookupValue(value) {
  return String(value || '').trim();
}

function normalizeKeySegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._/-]+/g, '-')
    .replaceAll(/\/+/g, '/')
    .replaceAll(/^-+|-+$/g, '');
}

function keyPathFromUrl(assetUrl) {
  const parsedUrl = new URL(assetUrl);
  const normalizedPath = normalizeKeySegment(decodeURIComponent(parsedUrl.pathname))
    .replace(/^\/+|\/+$/g, '');

  if (normalizedPath) {
    return normalizedPath;
  }

  return crypto
    .createHash('sha256')
    .update(parsedUrl.toString())
    .digest('hex');
}

function buildExternalAssetKey({ provider, assetType, assetUrl }) {
  if (!provider) {
    throw new Error('Media asset provider is required');
  }

  if (!ASSET_TYPE_PREFIXES[assetType]) {
    throw new Error('Media asset type must be audio or image');
  }

  if (!assetUrl) {
    throw new Error('Media asset URL is required');
  }

  return [
    'external',
    normalizeKeySegment(provider),
    ASSET_TYPE_PREFIXES[assetType],
    keyPathFromUrl(assetUrl),
  ].join('/');
}

function contentTypeFromUrl(assetUrl, assetType) {
  const pathname = new URL(assetUrl).pathname.toLowerCase();

  if (pathname.endsWith('.png')) {
    return 'image/png';
  }

  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (pathname.endsWith('.webp')) {
    return 'image/webp';
  }

  if (pathname.endsWith('.mp3')) {
    return 'audio/mpeg';
  }

  if (pathname.endsWith('.wav')) {
    return 'audio/wav';
  }

  return assetType === 'image' ? 'application/octet-stream' : 'audio/mpeg';
}

function normalizeMediaAssetLicense(license) {
  const value = String(license || '').trim().toLowerCase();

  return value || null;
}

function isUploadableMediaAssetLicense(license) {
  const normalizedLicense = normalizeMediaAssetLicense(license);

  return UPLOADABLE_MEDIA_ASSET_LICENSES.has(normalizedLicense);
}

function isRestrictedMediaAssetLicense(license) {
  return RESTRICTED_MEDIA_ASSET_LICENSES.has(normalizeMediaAssetLicense(license));
}

async function downloadAsset(assetUrl, { signal } = {}) {
  await mediaAssetDownloadRateLimiter.acquire();

  const response = await globalThis.fetch(assetUrl, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Asset download failed with status ${response.status}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}

function normalizeAssetList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((asset) => String(asset || '').trim())
    .filter(Boolean);
}

function normalizeEntityMedia(media) {
  if (!media || typeof media !== 'object' || Array.isArray(media)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(media)
      .map(([mediaType, assets]) => [
        normalizeLookupValue(mediaType),
        normalizeAssetList(assets),
      ])
      .filter(([mediaType, assets]) => mediaType && assets.length > 0)
  );
}

function mediaRoutePathFromKey(value) {
  const key = String(value || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/g, '');

  if (!key || /^[a-z][a-z0-9+.-]*:/i.test(key)) {
    return null;
  }

  const routePath = key.startsWith('files/') ? key : `files/${key}`;

  return `/${routePath}`;
}

class MediaAssetService {
  constructor(options = {}) {
    this.mediaAssets = options.mediaAssets || mediaAssetsConfig;
  }

  getEntityMedia(entityType, entityId) {
    const normalizedEntityType = normalizeLookupValue(entityType);
    const normalizedEntityId = normalizeLookupValue(entityId);

    if (!normalizedEntityType || !normalizedEntityId) {
      return {};
    }

    return normalizeEntityMedia(
      this.mediaAssets?.[normalizedEntityType]?.[normalizedEntityId]
    );
  }

  getMediaAssets(entityType, entityId, mediaType) {
    const normalizedMediaType = normalizeLookupValue(mediaType);

    if (!normalizedMediaType) {
      return [];
    }

    return this.getEntityMedia(entityType, entityId)[normalizedMediaType] || [];
  }

  getFirstMediaAsset(entityType, entityId, mediaType) {
    return this.getMediaAssets(entityType, entityId, mediaType)[0] || null;
  }

  getMediaAssetPaths(entityType, entityId, mediaType) {
    return this.getMediaAssets(entityType, entityId, mediaType)
      .map(mediaRoutePathFromKey)
      .filter(Boolean);
  }

  getFirstMediaAssetPath(entityType, entityId, mediaType) {
    return this.getMediaAssetPaths(entityType, entityId, mediaType)[0] || null;
  }
}

class MediaAssetUploadService {
  constructor(options = {}) {
    this.bucketService = options.bucketService || new S3BucketService();

    if (!globalThis.fetch) {
      throw new Error('Fetch is not available in this Node.js runtime');
    }
  }

  async uploadFromUrl(assetUrl, options = {}) {
    const {
      provider,
      assetType,
      key: requestedKey,
      license,
      signal,
    } = options;

    if (Object.hasOwn(options, 'license') && !isUploadableMediaAssetLicense(license)) {
      logger.info('External media asset upload skipped', {
        provider,
        assetType,
        assetUrl,
        license: normalizeMediaAssetLicense(license),
        reason: 'restricted_license',
      });

      return {
        provider,
        assetType,
        license: normalizeMediaAssetLicense(license),
        skipped: true,
        uploaded: false,
        reason: 'restricted_license',
        hotlinkUrl: assetUrl,
      };
    }

    const key = requestedKey || buildExternalAssetKey({ provider, assetType, assetUrl });

    try {
      if (await this.bucketService.objectExists(key)) {
        logger.info('External media asset upload skipped', {
          provider,
          assetType,
          key,
          reason: 'exists',
        });

        return {
          key,
          provider,
          assetType,
          skipped: true,
          uploaded: true,
          reason: 'exists',
        };
      }

      const asset = await downloadAsset(assetUrl, {
        signal,
      });
      const result = await this.bucketService.uploadObject({
        key,
        body: asset.body,
        contentType: asset.contentType || contentTypeFromUrl(assetUrl, assetType),
        metadata: {
          provider,
          assetType,
        },
        skipIfExists: false,
      });

      return {
        ...result,
        provider,
        assetType,
        uploaded: true,
      };
    } catch (error) {
      logger.error('External media asset upload failed', {
        provider,
        assetType,
        key,
        error: error.message,
      });

      throw error;
    }
  }

  async uploadAudioFromUrl(assetUrl, options = {}) {
    return this.uploadFromUrl(assetUrl, {
      ...options,
      assetType: 'audio',
    });
  }

  async uploadImageFromUrl(assetUrl, options = {}) {
    return this.uploadFromUrl(assetUrl, {
      ...options,
      assetType: 'image',
    });
  }
}

export {
  buildExternalAssetKey,
  contentTypeFromUrl,
  isRestrictedMediaAssetLicense,
  isUploadableMediaAssetLicense,
  MediaAssetUploadService,
  MediaAssetService,
  mediaRoutePathFromKey,
  normalizeAssetList,
  normalizeEntityMedia,
  normalizeMediaAssetLicense,
};
export default new MediaAssetService();
