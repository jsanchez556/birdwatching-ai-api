import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { parsePositiveInteger } from '../utils/number.utils.js';

const projectEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));

dotenv.config({
  path: projectEnvPath,
  quiet: true,
});

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
  'BULLMQ_JOB_ATTEMPTS',
  'BULLMQ_JOB_BACKOFF_DELAY_MS',
  'BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS',
  'BULLMQ_REMOVE_ON_COMPLETE_COUNT',
  'BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS',
  'BULLMQ_REMOVE_ON_FAIL_COUNT',
  'BULLMQ_WORKER_CONCURRENCY',
  'BIRD_IDENTIFICATION_JOB_STALL_TIMEOUT_MS',
  'STRIPE_WEBHOOK_TOLERANCE_SECONDS',
  'DEPENDENCY_HEALTH_TIMEOUT_MS',
  'SHUTDOWN_GRACE_PERIOD_MS',
  'SHUTDOWN_HARD_TIMEOUT_MS',
  'REDIS_CONNECT_TIMEOUT_MS',
];

for (const key of numericEnvKeys) {
  if (process.env[key] && Number.isNaN(Number(process.env[key]))) {
    throw new Error(`${key} must be a number`);
  }
}

for (const key of [
  'REDIS_CONNECT_TIMEOUT_MS',
  'DEPENDENCY_HEALTH_TIMEOUT_MS',
  'SHUTDOWN_GRACE_PERIOD_MS',
  'SHUTDOWN_HARD_TIMEOUT_MS',
]) {
  if (process.env[key] && Number(process.env[key]) <= 0) {
    throw new Error(`${key} must be greater than zero`);
  }
}

if (
  process.env.LOG_FILES_ENABLED &&
  !['true', 'false'].includes(process.env.LOG_FILES_ENABLED)
) {
  throw new Error('LOG_FILES_ENABLED must be true or false');
}

if (
  process.env.BULLMQ_DLQ_ENABLED &&
  !['true', 'false'].includes(process.env.BULLMQ_DLQ_ENABLED)
) {
  throw new Error('BULLMQ_DLQ_ENABLED must be true or false');
}

if (
  process.env.POSTHOG_ENABLED
  && !['true', 'false'].includes(process.env.POSTHOG_ENABLED)
) {
  throw new Error('POSTHOG_ENABLED must be true or false');
}

if (
  process.env.RATE_LIMIT_REDIS_FAILURE_MODE
  && !['local', 'deny'].includes(process.env.RATE_LIMIT_REDIS_FAILURE_MODE)
) {
  throw new Error('RATE_LIMIT_REDIS_FAILURE_MODE must be local or deny');
}

const shutdownGracePeriodMs = parsePositiveInteger(
  process.env.SHUTDOWN_GRACE_PERIOD_MS,
  15000
);
const shutdownHardTimeoutMs = parsePositiveInteger(
  process.env.SHUTDOWN_HARD_TIMEOUT_MS,
  30000
);

if (shutdownHardTimeoutMs <= shutdownGracePeriodMs) {
  throw new Error('SHUTDOWN_HARD_TIMEOUT_MS must be greater than SHUTDOWN_GRACE_PERIOD_MS');
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

const corsAllowedHeaders = (
  process.env.CORS_ALLOWED_HEADERS
    || [
      'Content-Type',
      'Authorization',
      'X-Filename',
      'X-Conversation-Id',
      'X-Role',
      'X-Response-Mode',
      'X-Customer-Context',
      'X-Conversation-Context',
    ].join(', ')
)
  .split(',')
  .map((header) => header.trim())
  .filter(Boolean);

const headLineBirds = (process.env.HEAD_LINE_BIRDS || process.env.HOMEPAGE_BIRD_HIGHLIGHTS || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const billingProviders = (process.env.BILLING_PROVIDERS || 'stripe')
  .split(',')
  .map((provider) => provider.trim().toLowerCase())
  .filter(Boolean);

const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  openAiApiKey: process.env.OPENAI_API_KEY,
  aiModelIds: {
    economy: process.env.OPENAI_ECONOMY_MODEL,
    balanced: process.env.OPENAI_BALANCED_MODEL || process.env.OPENAI_MODEL,
    advanced: process.env.OPENAI_ADVANCED_MODEL,
    structured: process.env.OPENAI_STRUCTURED_MODEL,
    vision: process.env.OPENAI_VISION_MODEL,
    evaluation: process.env.OPENAI_EVALUATION_MODEL,
    embedding: process.env.OPENAI_EMBEDDING_MODEL,
    transcription: process.env.OPENAI_TRANSCRIPTION_MODEL,
    speech: process.env.OPENAI_SPEECH_MODEL,
  },
  langChainApiKey: process.env.LANGCHAIN_API_KEY,
  langChainTracingV2: process.env.LANGCHAIN_TRACING === 'true',
  langChainProject: process.env.LANGCHAIN_PROJECT || 'birdwatching-ai',
  aiEvalResultsFile: process.env.AI_EVAL_OUTPUT_FILE
    || process.env.AI_EVAL_RESULTS_FILE
    || 'tmp/ai-eval-results.json',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: nodeEnv === 'test' ? 'test-jwt-secret' : process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 30,
  corsOrigins,
  corsAllowedHeaders,
  headLineBirds,
  homepageBirdHighlights: headLineBirds,
  logFilesEnabled: process.env.LOG_FILES_ENABLED === 'true',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
  aiRateLimitWindowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  aiRateLimitMaxRequests: Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS) || 12,
  rateLimitRedisFailureMode: process.env.RATE_LIMIT_REDIS_FAILURE_MODE || 'local',
  dependencyHealthTimeoutMs: parsePositiveInteger(
    process.env.DEPENDENCY_HEALTH_TIMEOUT_MS,
    1000
  ),
  shutdownGracePeriodMs,
  shutdownHardTimeoutMs,
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
  billing: {
    defaultProvider: (process.env.BILLING_DEFAULT_PROVIDER || billingProviders[0] || 'stripe')
      .trim()
      .toLowerCase(),
    providers: billingProviders,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    proPriceId: process.env.STRIPE_PRICE_PRO,
    guidePriceId: process.env.STRIPE_PRICE_GUIDE,
    checkoutSuccessUrl: process.env.STRIPE_CHECKOUT_SUCCESS_URL,
    checkoutCancelUrl: process.env.STRIPE_CHECKOUT_CANCEL_URL,
    portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL,
    webhookToleranceSeconds: parsePositiveInteger(
      process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS,
      5 * 60
    ),
  },
  posthog: {
    enabled: process.env.POSTHOG_ENABLED === 'true',
    apiKey: process.env.POSTHOG_API_KEY,
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  },
  birdIdentificationJobStallTimeoutMs: parsePositiveInteger(
    process.env.BIRD_IDENTIFICATION_JOB_STALL_TIMEOUT_MS,
    5 * 60 * 1000
  ),
};

export default env;
