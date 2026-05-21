import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

const missingObjectNames = new Set([
  'NotFound',
  'NoSuchKey',
  'NotFoundException',
]);

function isMissingObjectError(error) {
  return missingObjectNames.has(error?.name)
    || error?.$metadata?.httpStatusCode === 404
    || error?.Code === 'NotFound'
    || error?.Code === 'NoSuchKey';
}

function assertBucketConfig(config) {
  const required = [
    ['endpointUrl', 'S3_ENDPOINT_URL'],
    ['region', 'S3_REGION'],
    ['bucketName', 'S3_BUCKET_NAME'],
    ['accessKeyId', 'S3_ACCESS_KEY_ID'],
    ['secretAccessKey', 'S3_SECRET_ACCESS_KEY'],
  ];

  for (const [property, envName] of required) {
    if (!config?.[property]) {
      throw new Error(`Missing required environment variable: ${envName}`);
    }
  }
}

function createS3Client(config) {
  assertBucketConfig(config);

  return new S3Client({
    endpoint: config.endpointUrl,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

class S3BucketService {
  constructor(options = {}) {
    this.config = options.config || env.s3;
    this.client = options.client || createS3Client(this.config);
  }

  async objectExists(key) {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }));

      return true;
    } catch (error) {
      if (isMissingObjectError(error)) {
        return false;
      }

      throw error;
    }
  }

  async uploadObject(options = {}) {
    const {
      key,
      body,
      contentType,
      metadata,
      skipIfExists = true,
    } = options;

    if (!key) {
      throw new Error('S3 object key is required');
    }

    if (!body) {
      throw new Error('S3 object body is required');
    }

    try {
      if (skipIfExists && await this.objectExists(key)) {
        logger.info('S3 asset upload skipped because object already exists', {
          bucket: this.config.bucketName,
          key,
        });

        return {
          bucket: this.config.bucketName,
          key,
          skipped: true,
          reason: 'exists',
        };
      }

      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: body,
        ...(contentType ? { ContentType: contentType } : {}),
        ...(metadata ? { Metadata: metadata } : {}),
      }));

      return {
        bucket: this.config.bucketName,
        key,
        skipped: false,
      };
    } catch (error) {
      logger.error('S3 asset upload failed', {
        bucket: this.config.bucketName,
        key,
        error: error.message,
      });

      throw error;
    }
  }

  async createPresignedGetUrl(key, options = {}) {
    const {
      expiresIn = this.config.presignedUrlExpiresInSeconds
        || DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS,
      responseContentType,
    } = options;

    if (!key) {
      throw new Error('S3 object key is required');
    }

    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      ...(responseContentType ? { ResponseContentType: responseContentType } : {}),
    });

    return getSignedUrl(this.client, command, {
      expiresIn,
    });
  }
}

export {
  assertBucketConfig,
  createS3Client,
  DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS,
  isMissingObjectError,
};
export default S3BucketService;
