import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import pool from '../pool.js';
import logger from '../../utils/logger.js';

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'vector.schema.sql'
);

const DEFAULT_SEMANTIC_WEIGHT = 0.75;
const DEFAULT_KEYWORD_WEIGHT = 0.25;
const DEFAULT_MIN_SCORE = 0.2;
const DEFAULT_MIN_SEMANTIC_SCORE = 0.15;
const KEYWORD_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'best',
  'bird',
  'birds',
  'can',
  'do',
  'for',
  'from',
  'i',
  'in',
  'is',
  'it',
  'near',
  'of',
  'on',
  'see',
  'the',
  'to',
  'where',
  'with',
]);

function normalizeLimit(limit) {
  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return 3;
  }

  return Math.min(parsedLimit, 20);
}

function toVectorLiteral(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Embedding vector must be a non-empty array');
  }

  const values = vector.map((value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error('Embedding vector contains a non-numeric value');
    }

    return number;
  });

  return `[${values.join(',')}]`;
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function normalizeKeywordQuery(value) {
  const query = String(value || '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!query) {
    return null;
  }

  const keywords = query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2)
    .filter((word) => !KEYWORD_STOP_WORDS.has(word.toLowerCase()));

  return keywords.length > 0 ? keywords.join(' ') : null;
}

function normalizeSearchWeights(options = {}) {
  const semanticWeight = Number(options.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT);
  const keywordWeight = Number(options.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT);

  if (!Number.isFinite(semanticWeight) || !Number.isFinite(keywordWeight)) {
    return {
      semanticWeight: DEFAULT_SEMANTIC_WEIGHT,
      keywordWeight: DEFAULT_KEYWORD_WEIGHT,
    };
  }

  const total = semanticWeight + keywordWeight;

  if (total <= 0) {
    return {
      semanticWeight: DEFAULT_SEMANTIC_WEIGHT,
      keywordWeight: DEFAULT_KEYWORD_WEIGHT,
    };
  }

  return {
    semanticWeight: semanticWeight / total,
    keywordWeight: keywordWeight / total,
  };
}

function addOptionalFilter({ clauses, values }, sql, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }

  values.push(value);
  clauses.push(sql.replace('?', `$${values.length + 1}`));
}

function buildFilterClause(filters = {}) {
  const clauses = ['d.active = COALESCE($2::boolean, true)'];
  const values = [filters.active];

  addOptionalFilter({ clauses, values }, 'd.source = ?', filters.source);
  addOptionalFilter({ clauses, values }, 'd.document_type = ?', filters.documentType || filters.type);
  addOptionalFilter({ clauses, values }, 'd.locale = ?', filters.locale);

  if (filters.category) {
    values.push(filters.category);
    clauses.push(`LOWER(d.category) = LOWER($${values.length + 1})`);
  }

  if (filters.title) {
    values.push(`%${escapeLikePattern(filters.title)}%`);
    clauses.push(`d.title ILIKE $${values.length + 1} ESCAPE '\\'`);
  }

  if (filters.location) {
    values.push(`%${escapeLikePattern(filters.location)}%`);
    const placeholder = `$${values.length + 1}`;
    clauses.push(`(
      d.metadata->>'locations' ILIKE ${placeholder} ESCAPE '\\'
      OR c.metadata->>'locations' ILIKE ${placeholder} ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM unnest(d.tags) AS tag
        WHERE tag ILIKE ${placeholder} ESCAPE '\\'
      )
    )`);
  }

  const tags = toStringArray(filters.tags);
  if (tags.length > 0) {
    values.push(tags);
    clauses.push(`d.tags && $${values.length + 1}::text[]`);
  }

  if (filters.metadata && typeof filters.metadata === 'object') {
    values.push(JSON.stringify(filters.metadata));
    clauses.push(`(d.metadata @> $${values.length + 1}::jsonb OR c.metadata @> $${values.length + 1}::jsonb)`);
  }

  return {
    clause: clauses.join('\n    AND '),
    values,
  };
}

class VectorRepository {
  async initializeSchema() {
    try {
      const schemaSql = await readFile(schemaPath, 'utf8');
      await pool.query(schemaSql);
      logger.info('Vector knowledge schema initialized');
    } catch (error) {
      logger.error('Failed to initialize vector knowledge schema', {
        error: error.message,
      });
      throw error;
    }
  }

  async upsertDocument(document) {
    const query = `
      INSERT INTO knowledge_documents (
        external_id,
        title,
        source,
        document_type,
        category,
        locale,
        tags,
        metadata,
        content_hash,
        active,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb, $9, $10, CURRENT_TIMESTAMP)
      ON CONFLICT (external_id) DO UPDATE
      SET
        title = EXCLUDED.title,
        source = EXCLUDED.source,
        document_type = EXCLUDED.document_type,
        category = EXCLUDED.category,
        locale = EXCLUDED.locale,
        tags = EXCLUDED.tags,
        metadata = EXCLUDED.metadata,
        content_hash = EXCLUDED.content_hash,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [
      document.externalId,
      document.title,
      document.source || null,
      document.documentType || null,
      document.category || null,
      document.locale || null,
      toStringArray(document.tags),
      JSON.stringify(document.metadata || {}),
      document.contentHash || null,
      document.active !== false,
    ]);

    return result.rows[0];
  }

  async findDocumentByExternalId(externalId) {
    const result = await pool.query(
      'SELECT * FROM knowledge_documents WHERE external_id = $1',
      [externalId]
    );

    return result.rows[0] || null;
  }

  async replaceDocumentChunks(documentId, chunks) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [documentId]);

      for (const chunk of chunks) {
        await client.query(`
          INSERT INTO knowledge_chunks (
            document_id,
            chunk_index,
            content,
            token_count,
            metadata,
            embedding,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector, CURRENT_TIMESTAMP);
        `, [
          documentId,
          chunk.index,
          chunk.content,
          chunk.tokenCount || null,
          JSON.stringify(chunk.metadata || {}),
          toVectorLiteral(chunk.embedding),
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async searchSimilar(embedding, options = {}) {
    const limit = normalizeLimit(options.limit);
    const vector = toVectorLiteral(embedding);
    const { clause, values: filterValues } = buildFilterClause(options.filters);
    const values = [vector, ...filterValues];
    const keywordQuery = normalizeKeywordQuery(options.keywordQuery || options.queryText);
    const hasKeywordQuery = Boolean(keywordQuery);
    const { semanticWeight, keywordWeight } = normalizeSearchWeights(options);

    const minScore = Number(options.minScore ?? options.filters?.minScore ?? DEFAULT_MIN_SCORE);
    const hasMinScore = Number.isFinite(minScore);
    const minSemanticScore = Number(options.minSemanticScore ?? options.filters?.minSemanticScore ?? DEFAULT_MIN_SEMANTIC_SCORE);
    const hasMinSemanticScore = Number.isFinite(minSemanticScore);

    if (hasKeywordQuery) {
      values.push(keywordQuery);
    }

    const keywordPlaceholder = hasKeywordQuery ? `$${values.length}` : null;
    const semanticScoreSql = '1 - (c.embedding <=> $1::vector)';
    const searchVectorSql = `
      setweight(to_tsvector('simple', COALESCE(d.title, '')), 'A')
      || setweight(to_tsvector('simple', COALESCE(d.category, '')), 'B')
      || setweight(to_tsvector('simple', COALESCE(d.metadata->>'locations', '')), 'B')
      || setweight(to_tsvector('simple', array_to_string(COALESCE(d.tags, '{}'::text[]), ' ')), 'C')
      || setweight(to_tsvector('simple', COALESCE(c.content, '')), 'D')
    `;
    const keywordScoreSql = hasKeywordQuery
      ? `ts_rank_cd((${searchVectorSql}), plainto_tsquery('simple', ${keywordPlaceholder}))`
      : '0';
    const hybridScoreSql = `(${semanticWeight} * (${semanticScoreSql})) + (${keywordWeight} * (${keywordScoreSql}))`;

    if (hasMinScore) {
      values.push(minScore);
    }

    if (hasMinSemanticScore) {
      values.push(minSemanticScore);
    }

    const query = `
      SELECT *
      FROM (
        SELECT
          c.id AS chunk_id,
          c.chunk_index,
          c.content,
          c.metadata AS chunk_metadata,
          d.id AS document_id,
          d.external_id,
          d.title,
          d.source,
          d.document_type,
          d.category,
          d.locale,
          d.tags,
          d.metadata AS document_metadata,
          ${semanticScoreSql} AS semantic_score,
          ${keywordScoreSql} AS keyword_score,
          ${hybridScoreSql} AS score
        FROM knowledge_chunks AS c
        INNER JOIN knowledge_documents AS d ON d.id = c.document_id
        WHERE ${clause}
      ) AS ranked_chunks
      WHERE 1 = 1
        ${hasMinScore ? `AND score >= $${hasMinSemanticScore ? values.length - 1 : values.length}` : ''}
        ${hasMinSemanticScore ? `AND (semantic_score >= $${values.length} OR keyword_score > 0)` : ''}
      ORDER BY score DESC, semantic_score DESC, keyword_score DESC
      LIMIT $${values.length + 1};
    `;

    values.push(limit);

    const startedAt = Date.now();
    const result = await pool.query(query, values);

    logger.info('Vector similarity search completed', {
      resultCount: result.rowCount,
      limit,
      durationMs: Date.now() - startedAt,
      filters: options.filters || {},
      hasKeywordQuery,
      minScore: hasMinScore ? minScore : null,
      minSemanticScore: hasMinSemanticScore ? minSemanticScore : null,
    });

    return result.rows;
  }
}

export {
  buildFilterClause,
  DEFAULT_MIN_SCORE,
  DEFAULT_MIN_SEMANTIC_SCORE,
  normalizeKeywordQuery,
  normalizeLimit,
  normalizeSearchWeights,
  toVectorLiteral,
};
export default new VectorRepository();
