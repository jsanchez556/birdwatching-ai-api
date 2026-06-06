import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const required = ['OPENAI_API_KEY', 'DATABASE_URL', 'JWT_SECRET'];
const nodeEnv = process.env.NODE_ENV || 'development';
const allowedNodeEnvs = new Set(['development', 'test', 'production']);

if (!allowedNodeEnvs.has(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production');
}

if (process.env.PORT && Number.isNaN(Number(process.env.PORT))) {
  throw new Error('PORT must be a number');
}

const numericEnvKeys = [
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'AI_RATE_LIMIT_WINDOW_MS',
  'AI_RATE_LIMIT_MAX_REQUESTS',
  'EXTERNAL_API_RATE_LIMIT_WINDOW_MS',
  'EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS',
];

for (const key of numericEnvKeys) {
  if (process.env[key] && Number.isNaN(Number(process.env[key]))) {
    throw new Error(`${key} must be a number`);
  }
}

if (
  process.env.LOG_FILES_ENABLED &&
  !['true', 'false'].includes(process.env.LOG_FILES_ENABLED)
) {
  throw new Error('LOG_FILES_ENABLED must be true or false');
}

if (nodeEnv !== 'test') {
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

if (
  process.env.EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS
  && Number(process.env.EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS) > 40
) {
  throw new Error('EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS cannot exceed 40');
}

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const headLineBirds = (process.env.HEAD_LINE_BIRDS || process.env.HOMEPAGE_BIRD_HIGHLIGHTS || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: nodeEnv === 'test' ? 'test-jwt-secret' : process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 30,
  corsOrigins,
  headLineBirds,
  homepageBirdHighlights: headLineBirds,
  logFilesEnabled: process.env.LOG_FILES_ENABLED === 'true',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
  aiRateLimitWindowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  aiRateLimitMaxRequests: Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS) || 12,
  externalApiRateLimitWindowMs: Number(process.env.EXTERNAL_API_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  externalApiRateLimitMaxRequests: Number(process.env.EXTERNAL_API_RATE_LIMIT_MAX_REQUESTS) || 40,
  eBirdApiBaseUrl: process.env.E_BIRD_API_BASE_URL,
  eBirdApiKey: process.env.E_BIRD_API_KEY,
  iNaturalistApiBaseUrl: process.env.INATURALIST_API_BASE_URL,
  xenoCantoApiBaseUrl: process.env.XENO_CANTO_API_BASE_URL,
  xenoCantoApiKey: process.env.XENO_CANTO_API_KEY,
  wikiApiBaseUrl: process.env.WIKI_API_BASE_URL,
  cloudFrontBaseUrl: (process.env.CLOUDFRONT_BASE_URL || '').replace(/\/+$/, ''),
  s3: {
    region: process.env.S3_REGION,
    bucketName: process.env.S3_BUCKET_NAME,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  adminEmail: process.env.ADMIN_EMAIL,
};

export default env;
