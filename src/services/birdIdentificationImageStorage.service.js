import { randomUUID } from 'crypto';
import env from '../config/env.js';
import S3BucketService from '../storage/s3Bucket.service.js';
import HttpError from '../utils/httpError.js';

const BIRD_IDENTIFICATION_IMAGE_PREFIX = 'bird-identification';

const EXTENSION_BY_MIME_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function buildBirdIdentificationImageKey({ mimeType, id = randomUUID() } = {}) {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType] || 'jpg';

  return `${BIRD_IDENTIFICATION_IMAGE_PREFIX}/${id}.${extension}`;
}

function buildCloudFrontImageUrl(key, cloudFrontBaseUrl = env.cloudFrontBaseUrl) {
  const normalizedBaseUrl = String(cloudFrontBaseUrl || '').trim().replace(/\/+$/, '');

  if (!normalizedBaseUrl) {
    throw new HttpError(500, 'Image upload delivery is not configured.', {
      code: 'IMAGE_DELIVERY_NOT_CONFIGURED',
    });
  }

  return `${normalizedBaseUrl}/${String(key || '').split('/').map(encodeURIComponent).join('/')}`;
}

class BirdIdentificationImageStorageService {
  constructor(options = {}) {
    this.bucketService = options.bucketService;
    this.cloudFrontBaseUrl = options.cloudFrontBaseUrl;
  }

  getBucketService() {
    if (!this.bucketService) {
      this.bucketService = new S3BucketService();
    }

    return this.bucketService;
  }

  async uploadIdentificationImage({ imageUpload, userId } = {}) {
    const key = buildBirdIdentificationImageKey({ mimeType: imageUpload?.mimeType });

    await this.getBucketService().uploadObject({
      key,
      body: imageUpload.buffer,
      contentType: imageUpload.mimeType,
      metadata: {
        source: 'bird-identification',
        entityType: 'uploaded-identification-image',
        ...(userId !== undefined && userId !== null ? { userId: String(userId) } : {}),
      },
      skipIfExists: false,
    });

    return {
      key,
      imageUrl: buildCloudFrontImageUrl(key, this.cloudFrontBaseUrl),
    };
  }
}

export {
  BIRD_IDENTIFICATION_IMAGE_PREFIX,
  BirdIdentificationImageStorageService,
  buildBirdIdentificationImageKey,
  buildCloudFrontImageUrl,
};
export default new BirdIdentificationImageStorageService();
