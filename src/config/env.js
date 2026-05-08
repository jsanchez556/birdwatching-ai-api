import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const required = ['OPENAI_API_KEY', 'DATABASE_URL'];
const nodeEnv = process.env.NODE_ENV || 'development';
const allowedNodeEnvs = new Set(['development', 'test', 'production']);

if (!allowedNodeEnvs.has(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production');
}

if (process.env.PORT && Number.isNaN(Number(process.env.PORT))) {
  throw new Error('PORT must be a number');
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

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins,
  logFilesEnabled: process.env.LOG_FILES_ENABLED === 'true',
};

export default env;
