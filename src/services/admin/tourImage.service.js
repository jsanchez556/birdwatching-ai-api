import adminMaintenanceQueries from '../../db/queries/adminMaintenance.queries.js';
import S3BucketService from '../../storage/s3Bucket.service.js';
import HttpError from '../../utils/httpError.js';
import logger from '../../utils/logger.js';
import {
  buildTourImageUploadKey,
  hasPngSignature,
  isTourImageKey,
  normalizeTourImageKey,
  TOUR_IMAGE_MAX_BYTES,
  TOUR_IMAGE_MIME_TYPE,
  tourImageVersionFromDate,
  appendTourImageVersion,
} from '../../utils/tourImage.utils.js';

class TourImageService {
  constructor(options = {}) {
    this.bucketService = options.bucketService;
    this.logger = options.logger || logger;
    this.queries = options.queries || adminMaintenanceQueries;
    this.imageKeyFactory = options.imageKeyFactory || buildTourImageUploadKey;
  }

  async replace({ tourId, imageUpload } = {}) {
    const id = Number(tourId);
    const tour = await this.queries.getById('tours', id);

    if (!tour) {
      throw new HttpError(404, 'Tour not found', { code: 'TOUR_NOT_FOUND' });
    }

    if (!imageUpload?.buffer || !Buffer.isBuffer(imageUpload.buffer)) {
      throw new HttpError(422, 'Tour image is required', { code: 'TOUR_IMAGE_REQUIRED' });
    }

    if (imageUpload.buffer.length > TOUR_IMAGE_MAX_BYTES) {
      throw new HttpError(413, 'Tour image must be 5 MB or smaller', {
        code: 'TOUR_IMAGE_TOO_LARGE',
      });
    }

    if (imageUpload.mimeType !== TOUR_IMAGE_MIME_TYPE || !hasPngSignature(imageUpload.buffer)) {
      throw new HttpError(422, 'Tour image must be a valid PNG file', {
        code: 'INVALID_TOUR_IMAGE_TYPE',
      });
    }

    // The new object key is the cache boundary, including for CloudFront
    // distributions that do not include query strings in their cache keys.
    const key = this.imageKeyFactory(id);
    const previousKey = normalizeTourImageKey(tour.imagePath);
    const bucketService = this.bucketService || new S3BucketService();

    try {
      await bucketService.uploadObject({
        key,
        body: imageUpload.buffer,
        cacheControl: 'public, max-age=31536000, immutable',
        contentType: TOUR_IMAGE_MIME_TYPE,
        metadata: {
          entityType: 'tour-image',
          tourId: String(id),
        },
        skipIfExists: false,
      });
    } catch {
      throw new HttpError(502, 'Tour image could not be saved. Please try again.', {
        code: 'TOUR_IMAGE_UPLOAD_FAILED',
        expose: true,
      });
    }

    let persistedTour;
    try {
      persistedTour = await this.queries.setTourImagePath(id, key);
    } catch {
      throw new HttpError(502, 'Tour image was stored but its tour record could not be updated. Please retry.', {
        code: 'TOUR_IMAGE_PATH_PERSIST_FAILED',
        expose: true,
      });
    }

    if (!persistedTour) {
      throw new HttpError(404, 'Tour not found', { code: 'TOUR_NOT_FOUND' });
    }

    let cleanupPending = false;
    if (previousKey !== key && isTourImageKey(previousKey)) {
      try {
        await bucketService.deleteObject(previousKey);
      } catch {
        cleanupPending = true;
        this.logger.warn('Previous tour image cleanup pending', {
          code: 'TOUR_IMAGE_PREVIOUS_CLEANUP_PENDING',
        });
      }
    }

    const version = tourImageVersionFromDate(persistedTour.updatedAt);
    const imageReference = appendTourImageVersion(`/files/${key}`, version);

    return {
      tour: { id: persistedTour.id, name: persistedTour.name, imagePath: persistedTour.imagePath },
      image: {
        key,
        url: imageReference,
        version,
        cleanupPending,
        mimeType: TOUR_IMAGE_MIME_TYPE,
        size: imageUpload.buffer.length,
      },
    };
  }
}

export { TourImageService };
export default new TourImageService();
