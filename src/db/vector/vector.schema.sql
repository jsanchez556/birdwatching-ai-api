CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id SERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT,
  source TEXT,
  document_type TEXT,
  category TEXT,
  locale TEXT,
  tags TEXT[] DEFAULT '{}'::text[],
  metadata JSONB DEFAULT '{}'::jsonb,
  content_hash TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS content TEXT;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_external_id
ON knowledge_documents(external_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_active
ON knowledge_documents(active);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_source
ON knowledge_documents(source);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_category
ON knowledge_documents(category);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_type
ON knowledge_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_locale
ON knowledge_documents(locale);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tags
ON knowledge_documents USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_metadata
ON knowledge_documents USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id
ON knowledge_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_metadata
ON knowledge_chunks USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_text_search
ON knowledge_documents USING gin(to_tsvector(
  'simple'::regconfig,
  COALESCE(title, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(metadata->>'locations', '')
));

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_text_search
ON knowledge_chunks USING gin(to_tsvector('simple'::regconfig, COALESCE(content, '')));
