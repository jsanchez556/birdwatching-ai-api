import { jest } from '@jest/globals';
import {
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import express from 'express';
import request from 'supertest';

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
  },
}));

const logger = (await import('../src/utils/logger.js')).default;
const {
  default: S3BucketService,
} = await import('../src/storage/s3Bucket.service.js');
const {
  buildExternalAssetKey,
  MediaAssetUploadService,
  isRestrictedMediaAssetLicense,
  isUploadableMediaAssetLicense,
  normalizeMediaAssetLicense,
} = await import('../src/services/mediaAsset.service.js');
const {
  createFileHandler,
  normalizeFileName,
} = await import('../src/routes/media.routes.js');
const { default: HttpError } = await import('../src/utils/httpError.js');
const { default: errorMiddleware } = await import('../src/middleware/error.middleware.js');

function createConfig() {
  return {
    endpointUrl: 'https://example-bucket.railway.app',
    region: 'us-west-1',
    bucketName: 'bucket',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  };
}

function createFetchResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status || 200,
    headers: {
      get: jest.fn((name) => (
        name.toLowerCase() === 'content-type' ? options.contentType : undefined
      )),
    },
    arrayBuffer: jest.fn().mockResolvedValue(Buffer.from(body).buffer),
  };
}

describe('S3BucketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads an object after a missing-object HEAD response', async () => {
    const send = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('not found'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }))
      .mockResolvedValueOnce({});
    const service = new S3BucketService({
      client: { send },
      config: createConfig(),
    });

    await expect(service.uploadObject({
      key: 'external/xenocanto/audio/774101/download',
      body: Buffer.from('audio'),
      contentType: 'audio/mpeg',
      metadata: {
        provider: 'xenocanto',
        assetType: 'audio',
      },
    })).resolves.toEqual({
      bucket: 'bucket',
      key: 'external/xenocanto/audio/774101/download',
      skipped: false,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'bucket',
      Key: 'external/xenocanto/audio/774101/download',
    });
    expect(send.mock.calls[1][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[1][0].input).toMatchObject({
      Bucket: 'bucket',
      Key: 'external/xenocanto/audio/774101/download',
      ContentType: 'audio/mpeg',
      Metadata: {
        provider: 'xenocanto',
        assetType: 'audio',
      },
    });
  });

  it('skips uploading when the object already exists', async () => {
    const send = jest.fn().mockResolvedValueOnce({});
    const service = new S3BucketService({
      client: { send },
      config: createConfig(),
    });

    await expect(service.uploadObject({
      key: 'external/inaturalist/images/582371550/medium.jpg',
      body: Buffer.from('image'),
    })).resolves.toEqual({
      bucket: 'bucket',
      key: 'external/inaturalist/images/582371550/medium.jpg',
      skipped: true,
      reason: 'exists',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(logger.info).toHaveBeenCalledWith(
      'S3 asset upload skipped because object already exists',
      expect.objectContaining({
        bucket: 'bucket',
        key: 'external/inaturalist/images/582371550/medium.jpg',
      })
    );
  });

  it('logs and rethrows failed uploads without logging credentials', async () => {
    const uploadError = new Error('network stopped');
    const send = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('not found'), {
        name: 'NotFound',
      }))
      .mockRejectedValueOnce(uploadError);
    const service = new S3BucketService({
      client: { send },
      config: createConfig(),
    });

    await expect(service.uploadObject({
      key: 'external/xenocanto/images/spectrogram.png',
      body: Buffer.from('image'),
    })).rejects.toThrow('network stopped');

    expect(logger.error).toHaveBeenCalledWith('S3 asset upload failed', {
      bucket: 'bucket',
      key: 'external/xenocanto/images/spectrogram.png',
      error: 'network stopped',
    });
  });

  it('creates presigned URLs for private objects', async () => {
    const service = new S3BucketService({
      config: createConfig(),
    });

    const signedUrl = await service.createPresignedGetUrl(
      'external/xenocanto/audio/774101/download',
      { expiresIn: 120 }
    );
    const parsedUrl = new URL(signedUrl);

    expect(parsedUrl.origin).toBe('https://example-bucket.railway.app');
    expect(parsedUrl.pathname).toBe('/bucket/external/xenocanto/audio/774101/download');
    expect(parsedUrl.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(parsedUrl.searchParams.has('X-Amz-Signature')).toBe(true);
  });

  it('requires an object key before creating a presigned URL', async () => {
    const service = new S3BucketService({
      client: { send: jest.fn() },
      config: createConfig(),
    });

    await expect(service.createPresignedGetUrl()).rejects.toThrow('S3 object key is required');
  });
});

describe('MediaAssetUploadService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('generates deterministic object keys for Xeno-canto and iNaturalist URLs', () => {
    expect(buildExternalAssetKey({
      provider: 'xenocanto',
      assetType: 'audio',
      assetUrl: 'https://xeno-canto.org/774101/download',
    })).toBe('external/xenocanto/audio/774101/download');

    expect(buildExternalAssetKey({
      provider: 'xenocanto',
      assetType: 'image',
      assetUrl: 'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/colour.png',
    })).toBe('external/xenocanto/images/sounds/spectrograms/fscgenvpxk/774101/colour.png');

    expect(buildExternalAssetKey({
      provider: 'inaturalist',
      assetType: 'image',
      assetUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
    })).toBe('external/inaturalist/images/photos/582371550/medium.jpg');
  });

  it('normalizes and classifies media asset licenses', () => {
    expect(normalizeMediaAssetLicense(' CC-BY-SA ')).toBe('cc-by-sa');
    expect(isUploadableMediaAssetLicense('cc-by')).toBe(true);
    expect(isUploadableMediaAssetLicense('cc-by-sa')).toBe(true);
    expect(isUploadableMediaAssetLicense('cc-by-nc')).toBe(false);
    expect(isUploadableMediaAssetLicense('all rights reserved')).toBe(false);
    expect(isUploadableMediaAssetLicense()).toBe(false);
    expect(isRestrictedMediaAssetLicense('cc-by-nc-nd')).toBe(true);
  });

  it('downloads and uploads an audio asset from a URL', async () => {
    const bucketService = {
      objectExists: jest.fn().mockResolvedValue(false),
      uploadObject: jest.fn().mockResolvedValue({
        bucket: 'bucket',
        key: 'external/xenocanto/audio/774101/download',
        skipped: false,
      }),
    };
    globalThis.fetch = jest.fn().mockResolvedValue(createFetchResponse('audio-data', {
      contentType: 'audio/mpeg',
    }));
    const service = new MediaAssetUploadService({
      bucketService,
    });

    const result = await service.uploadAudioFromUrl('https://xeno-canto.org/774101/download', {
      provider: 'xenocanto',
    });

    expect(result).toMatchObject({
      bucket: 'bucket',
      key: 'external/xenocanto/audio/774101/download',
      provider: 'xenocanto',
      assetType: 'audio',
      skipped: false,
    });
    expect(result).not.toHaveProperty('signedUrl');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://xeno-canto.org/774101/download', {
      method: 'GET',
      signal: undefined,
    });
    expect(bucketService.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
      key: 'external/xenocanto/audio/774101/download',
      contentType: 'audio/mpeg',
      metadata: {
        provider: 'xenocanto',
        assetType: 'audio',
      },
      skipIfExists: false,
    }));
  });

  it('skips duplicate image uploads before downloading', async () => {
    const bucketService = {
      objectExists: jest.fn().mockResolvedValue(true),
      uploadObject: jest.fn(),
    };
    globalThis.fetch = jest.fn();
    const service = new MediaAssetUploadService({
      bucketService,
    });

    const result = await service.uploadImageFromUrl(
      'https://xeno-canto.org/sounds/spectrograms/FSCGENVPXK/774101/colour.png',
      { provider: 'xenocanto' }
    );

    expect(result).toEqual({
      key: 'external/xenocanto/images/sounds/spectrograms/fscgenvpxk/774101/colour.png',
      provider: 'xenocanto',
      assetType: 'image',
      skipped: true,
      uploaded: true,
      reason: 'exists',
    });
    expect(result).not.toHaveProperty('signedUrl');

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(bucketService.uploadObject).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('External media asset upload skipped', {
      provider: 'xenocanto',
      assetType: 'image',
      key: 'external/xenocanto/images/sounds/spectrograms/fscgenvpxk/774101/colour.png',
      reason: 'exists',
    });
  });

  it('returns a hotlink result for restricted media licenses without downloading', async () => {
    const bucketService = {
      objectExists: jest.fn(),
      uploadObject: jest.fn(),
    };
    globalThis.fetch = jest.fn();
    const service = new MediaAssetUploadService({
      bucketService,
    });

    const result = await service.uploadImageFromUrl(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
      {
        provider: 'inaturalist',
        license: 'cc-by-nc',
      }
    );

    expect(result).toEqual({
      provider: 'inaturalist',
      assetType: 'image',
      license: 'cc-by-nc',
      skipped: true,
      uploaded: false,
      reason: 'restricted_license',
      hotlinkUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
    });
    expect(bucketService.objectExists).not.toHaveBeenCalled();
    expect(bucketService.uploadObject).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('External media asset upload skipped', {
      provider: 'inaturalist',
      assetType: 'image',
      assetUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
      license: 'cc-by-nc',
      reason: 'restricted_license',
    });

    const audioResult = await service.uploadAudioFromUrl(
      'https://xeno-canto.org/774101/download',
      {
        provider: 'xenocanto',
        license: 'cc-by-nc-sa',
      }
    );

    expect(audioResult).toEqual({
      provider: 'xenocanto',
      assetType: 'audio',
      license: 'cc-by-nc-sa',
      skipped: true,
      uploaded: false,
      reason: 'restricted_license',
      hotlinkUrl: 'https://xeno-canto.org/774101/download',
    });
    expect(bucketService.objectExists).not.toHaveBeenCalled();
    expect(bucketService.uploadObject).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('logs and rethrows failed media downloads', async () => {
    const bucketService = {
      objectExists: jest.fn().mockResolvedValue(false),
      uploadObject: jest.fn(),
    };
    globalThis.fetch = jest.fn().mockResolvedValue(createFetchResponse('', {
      ok: false,
      status: 503,
    }));
    const service = new MediaAssetUploadService({
      bucketService,
    });

    await expect(service.uploadImageFromUrl(
      'https://inaturalist-open-data.s3.amazonaws.com/photos/582371550/medium.jpg',
      { provider: 'inaturalist' }
    )).rejects.toThrow('Asset download failed with status 503');

    expect(bucketService.uploadObject).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('External media asset upload failed', {
      provider: 'inaturalist',
      assetType: 'image',
      key: 'external/inaturalist/images/photos/582371550/medium.jpg',
      error: 'Asset download failed with status 503',
    });
  });
});

function createMediaTestApp(bucketService) {
  const app = express();

  app.get('/files', (req, res, next) => {
    next(new HttpError(400, 'File name is required.', { code: 'FILE_NAME_REQUIRED' }));
  });
  app.get('/files/:fileName', createFileHandler({
    bucketService,
  }));
  app.use(errorMiddleware);

  return app;
}

describe('media routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes encoded S3 object keys from a file name parameter', () => {
    expect(normalizeFileName(
      'external/xenocanto/images/sounds/spectrograms/FSCGENVPXK/774101/colour.png'
    )).toBe('external/xenocanto/images/sounds/spectrograms/fscgenvpxk/774101/colour.png');
  });

  it('returns a temporary signed URL for an existing private file', async () => {
    const key = 'external/xenocanto/images/sounds/spectrograms/fscgenvpxk/774101/colour.png';
    const signedUrl = 'https://example-bucket.railway.app/bucket/external/xenocanto/images/sounds/spectrograms/fscgenvpxk/774101/colour.png?X-Amz-Signature=test';
    const bucketService = {
      config: {
        presignedUrlExpiresInSeconds: 900,
      },
      objectExists: jest.fn().mockResolvedValue(true),
      createPresignedGetUrl: jest.fn().mockResolvedValue(signedUrl),
    };

    const res = await request(createMediaTestApp(bucketService))
      .get(`/files/${encodeURIComponent(key)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        url: signedUrl,
      },
      meta: {
        expiresInSeconds: 900,
      },
    });
    expect(bucketService.objectExists).toHaveBeenCalledWith(key);
    expect(bucketService.createPresignedGetUrl).toHaveBeenCalledWith(key);
  });

  it('returns a temporary signed URL from the general files route', async () => {
    const signedUrl = 'https://example-bucket.railway.app/bucket/sonograms/106498_grey-small.png?X-Amz-Signature=test';
    const bucketService = {
      config: {},
      objectExists: jest.fn().mockResolvedValue(true),
      createPresignedGetUrl: jest.fn().mockResolvedValue(signedUrl),
    };
    const app = express();

    app.get('/files', (req, res, next) => {
      next(new HttpError(400, 'File name is required.', { code: 'FILE_NAME_REQUIRED' }));
    });
    app.get('/files/:folderName', (req, res, next) => {
      next(new HttpError(400, 'File name is required.', { code: 'FILE_NAME_REQUIRED' }));
    });
    app.get('/files/:folderName/:filename', createFileHandler({
      bucketService,
      buildKey: (req) => `${req.params.folderName}/${req.params.filename}`,
    }));
    app.use(errorMiddleware);

    const res = await request(app)
      .get('/files/sonograms/106498_grey-small.png');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.url).toBe(signedUrl);
    expect(bucketService.objectExists).toHaveBeenCalledWith('sonograms/106498_grey-small.png');
    expect(bucketService.createPresignedGetUrl)
      .toHaveBeenCalledWith('sonograms/106498_grey-small.png');
  });

  it('supports tour media object keys through the files route', async () => {
    const signedUrl = 'https://example-bucket.railway.app/bucket/tours/1.png?X-Amz-Signature=test';
    const bucketService = {
      config: {},
      objectExists: jest.fn().mockResolvedValue(true),
      createPresignedGetUrl: jest.fn().mockResolvedValue(signedUrl),
    };
    const app = express();

    app.get('/files/:folderName/:filename', createFileHandler({
      bucketService,
      buildKey: (req) => `${req.params.folderName}/${req.params.filename}`,
    }));
    app.use(errorMiddleware);

    const res = await request(app).get('/files/tours/1.png');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.url).toBe(signedUrl);
    expect(bucketService.objectExists).toHaveBeenCalledWith('tours/1.png');
    expect(bucketService.createPresignedGetUrl).toHaveBeenCalledWith('tours/1.png');
  });

  it('returns a safe 404 when the private file is missing', async () => {
    const key = 'external/xenocanto/images/sounds/spectrograms/missing.png';
    const bucketService = {
      config: {},
      objectExists: jest.fn().mockResolvedValue(false),
      createPresignedGetUrl: jest.fn(),
    };

    const res = await request(createMediaTestApp(bucketService))
      .get(`/files/${encodeURIComponent(key)}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: 'File not found.',
      },
    });
    expect(bucketService.createPresignedGetUrl).not.toHaveBeenCalled();
  });

  it('returns safe validation errors for invalid or missing file names', async () => {
    const bucketService = {
      config: {},
      objectExists: jest.fn(),
      createPresignedGetUrl: jest.fn(),
    };
    const app = createMediaTestApp(bucketService);

    const invalidPathResponse = await request(app)
      .get(`/files/${encodeURIComponent('external/xenocanto/images/bad path.png')}`);
    const missingPathResponse = await request(app)
      .get('/files');

    expect(invalidPathResponse.statusCode).toBe(400);
    expect(invalidPathResponse.body.error.code).toBe('INVALID_FILE_NAME');
    expect(missingPathResponse.statusCode).toBe(400);
    expect(missingPathResponse.body.error.code).toBe('FILE_NAME_REQUIRED');
    expect(bucketService.objectExists).not.toHaveBeenCalled();
  });
});
