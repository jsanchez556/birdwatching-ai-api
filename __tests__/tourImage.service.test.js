import { jest } from '@jest/globals';
import { TourImageService } from '../src/services/admin/tourImage.service.js';
import { buildTourImageUploadKey, isTourImageKey } from '../src/utils/tourImage.utils.js';

const OLD_UUID = '22222222-2222-4222-8222-222222222222';
const NEW_UUID = '11111111-1111-4111-8111-111111111111';
const NEW_KEY = `tours/${NEW_UUID}.png`;
const SECOND_KEY = 'tours/33333333-3333-4333-8333-333333333333.png';
const OLD_KEY = `tours/${OLD_UUID}.png`;
const UPDATED_AT = '2026-09-03T23:20:00.000Z';
const IMAGE_VERSION = '1788477600000';
const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('image-data'),
]);

function createService({ previousKey = null, bucketService, queries, logger, imageKeyFactory } = {}) {
  const storage = bucketService || {
    uploadObject: jest.fn().mockResolvedValue({ key: NEW_KEY }),
    deleteObject: jest.fn().mockResolvedValue({ key: OLD_KEY, deleted: true }),
  };
  const persistence = queries || {
    getById: jest.fn().mockResolvedValue({
      id: 7, name: 'Cloud forest walk', imagePath: previousKey,
    }),
    setTourImagePath: jest.fn().mockResolvedValue({
      id: 7, name: 'Cloud forest walk', imagePath: NEW_KEY, updatedAt: UPDATED_AT,
    }),
  };
  const safeLogger = logger || { warn: jest.fn() };
  return {
    bucketService: storage,
    logger: safeLogger,
    queries: persistence,
    service: new TourImageService({
      bucketService: storage,
      imageKeyFactory: imageKeyFactory || (() => NEW_KEY),
      logger: safeLogger,
      queries: persistence,
    }),
  };
}

describe('TourImageService', () => {
  it('creates a distinct valid immutable object key for every upload', () => {
    const first = buildTourImageUploadKey();
    const second = buildTourImageUploadKey();

    expect(isTourImageKey(first)).toBe(true);
    expect(isTourImageKey(second)).toBe(true);
    expect(isTourImageKey('tours/11')).toBe(true);
    expect(isTourImageKey('tours/not-a-tour')).toBe(false);
    expect(second).not.toBe(first);
  });

  it('uploads an immutable first image and persists it without cleanup', async () => {
    const { bucketService, queries, service } = createService();

    await expect(service.replace({
      tourId: 7,
      imageUpload: { buffer: validPng, mimeType: 'image/png', filename: 'first.png' },
    })).resolves.toEqual({
      tour: { id: 7, name: 'Cloud forest walk', imagePath: NEW_KEY },
      image: {
        key: NEW_KEY,
        url: `/files/${NEW_KEY}?v=${IMAGE_VERSION}`,
        version: IMAGE_VERSION,
        cleanupPending: false,
        mimeType: 'image/png',
        size: validPng.length,
      },
    });

    expect(bucketService.uploadObject).toHaveBeenCalledWith({
      key: NEW_KEY,
      body: validPng,
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: 'image/png',
      metadata: { entityType: 'tour-image', tourId: '7' },
      skipIfExists: false,
    });
    expect(queries.setTourImagePath).toHaveBeenCalledWith(7, NEW_KEY);
    expect(bucketService.deleteObject).not.toHaveBeenCalled();
  });

  it('persists a replacement before deleting a previous UUID object', async () => {
    const { bucketService, queries, service } = createService({ previousKey: OLD_KEY });
    await service.replace({
      tourId: 7,
      imageUpload: { buffer: validPng, mimeType: 'image/png' },
    });
    expect(bucketService.deleteObject).toHaveBeenCalledWith(OLD_KEY);
    expect(bucketService.uploadObject.mock.invocationCallOrder[0])
      .toBeLessThan(queries.setTourImagePath.mock.invocationCallOrder[0]);
    expect(queries.setTourImagePath.mock.invocationCallOrder[0])
      .toBeLessThan(bucketService.deleteObject.mock.invocationCallOrder[0]);
  });

  it('cleans up the canonical PNG object for a legacy extensionless path', async () => {
    const { bucketService, service } = createService({ previousKey: 'tours/7' });

    await service.replace({
      tourId: 7,
      imageUpload: { buffer: validPng, mimeType: 'image/png', filename: 'replacement.png' },
    });

    expect(bucketService.deleteObject).toHaveBeenCalledWith('tours/7.png');
  });

  it('leaves persistence and the previous object unchanged when upload fails', async () => {
    const { bucketService, queries, service } = createService({
      previousKey: OLD_KEY,
      bucketService: {
        uploadObject: jest.fn().mockRejectedValue(new Error('S3 failed')),
        deleteObject: jest.fn(),
      },
    });
    await expect(service.replace({
      tourId: 7,
      imageUpload: { buffer: validPng, mimeType: 'image/png' },
    })).rejects.toMatchObject({ code: 'TOUR_IMAGE_UPLOAD_FAILED' });
    expect(queries.setTourImagePath).not.toHaveBeenCalled();
    expect(bucketService.deleteObject).not.toHaveBeenCalled();
  });

  it('keeps the previous database path and never deletes it when persistence fails', async () => {
    const queries = {
      getById: jest.fn().mockResolvedValue({
        id: 7, name: 'Cloud forest walk', imagePath: OLD_KEY,
      }),
      setTourImagePath: jest.fn().mockRejectedValue(new Error('database failed')),
    };
    const { bucketService, service } = createService({ queries });
    await expect(service.replace({
      tourId: 7,
      imageUpload: { buffer: validPng, mimeType: 'image/png' },
    })).rejects.toMatchObject({ code: 'TOUR_IMAGE_PATH_PERSIST_FAILED' });
    expect(bucketService.deleteObject).not.toHaveBeenCalledWith(NEW_KEY);
    expect(bucketService.deleteObject).not.toHaveBeenCalledWith(OLD_KEY);
  });

  it('keeps a successful replacement when previous-object cleanup fails', async () => {
    const logger = { warn: jest.fn() };
    const bucketService = {
      uploadObject: jest.fn().mockResolvedValue({ key: NEW_KEY }),
      deleteObject: jest.fn().mockRejectedValue(new Error('delete failed')),
    };
    const { service } = createService({ previousKey: OLD_KEY, bucketService, logger });
    await expect(service.replace({
      tourId: 7,
      imageUpload: { buffer: validPng, mimeType: 'image/png' },
    })).resolves.toMatchObject({ image: { key: NEW_KEY, cleanupPending: true } });
    expect(logger.warn).toHaveBeenCalledWith('Previous tour image cleanup pending', {
      code: 'TOUR_IMAGE_PREVIOUS_CLEANUP_PENDING',
    });
  });

  it.each([
    ['an unsafe previous key', 'profiles/not-a-tour.png'],
    ['the same generated key', NEW_KEY],
  ])('does not delete %s', async (_label, previousKey) => {
    const { bucketService, service } = createService({ previousKey });
    await service.replace({
      tourId: 7,
      imageUpload: { buffer: validPng, mimeType: 'image/png' },
    });
    expect(bucketService.deleteObject).not.toHaveBeenCalled();
  });

  it('returns a new stable version for a later successful replacement', async () => {
    const imageKeyFactory = jest.fn()
      .mockReturnValueOnce(NEW_KEY)
      .mockReturnValueOnce(SECOND_KEY);
    const { queries, service } = createService({ previousKey: NEW_KEY, imageKeyFactory });
    queries.setTourImagePath
      .mockResolvedValueOnce({ id: 7, name: 'Cloud forest walk', imagePath: NEW_KEY, updatedAt: UPDATED_AT })
      .mockResolvedValueOnce({ id: 7, name: 'Cloud forest walk', imagePath: NEW_KEY, updatedAt: '2026-09-03T23:21:00.000Z' });

    const first = await service.replace({
      tourId: 7, imageUpload: { buffer: validPng, mimeType: 'image/png' },
    });
    const second = await service.replace({
      tourId: 7, imageUpload: { buffer: validPng, mimeType: 'image/png' },
    });

    expect(first.image.version).toBe(IMAGE_VERSION);
    expect(second.image.version).toBe('1788477660000');
    expect(first.image.key).toBe(NEW_KEY);
    expect(second.image.key).toBe(SECOND_KEY);
    expect(second.image.url).toBe(`/files/${SECOND_KEY}?v=1788477660000`);
  });

  it('rejects missing tours before writing to storage', async () => {
    const { bucketService, service } = createService({
      queries: { getById: jest.fn().mockResolvedValue(null), setTourImagePath: jest.fn() },
    });
    await expect(service.replace({
      tourId: 404,
      imageUpload: { buffer: validPng, mimeType: 'image/png' },
    })).rejects.toMatchObject({ code: 'TOUR_NOT_FOUND' });
    expect(bucketService.uploadObject).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'TOUR_IMAGE_REQUIRED'],
    [{ buffer: Buffer.from('not-png'), mimeType: 'image/png' }, 'INVALID_TOUR_IMAGE_TYPE'],
    [{ buffer: validPng, mimeType: 'image/jpeg' }, 'INVALID_TOUR_IMAGE_TYPE'],
  ])('rejects invalid image input %#', async (imageUpload, code) => {
    const { bucketService, service } = createService();
    await expect(service.replace({ tourId: 7, imageUpload })).rejects.toMatchObject({ code });
    expect(bucketService.uploadObject).not.toHaveBeenCalled();
  });

  it('rejects images larger than 5 MB before writing to storage', async () => {
    const oversizedPng = Buffer.alloc((5 * 1024 * 1024) + 1);
    validPng.copy(oversizedPng);
    const { bucketService, service } = createService();
    await expect(service.replace({
      tourId: 7,
      imageUpload: { buffer: oversizedPng, mimeType: 'image/png' },
    })).rejects.toMatchObject({ code: 'TOUR_IMAGE_TOO_LARGE' });
    expect(bucketService.uploadObject).not.toHaveBeenCalled();
  });
});
