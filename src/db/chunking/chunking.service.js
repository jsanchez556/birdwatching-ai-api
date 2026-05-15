const DEFAULT_TARGET_CHUNK_SIZE = 1000;
const DEFAULT_MAX_CHUNK_SIZE = 1400;
const DEFAULT_MIN_CHUNK_SIZE = 180;
const DEFAULT_CHUNK_OVERLAP = 150;

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeParagraphText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join('\n\n');
}

function splitIntoParagraphs(text) {
  return normalizeParagraphText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitIntoSentences(text) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitLongText(text, maxChunkSize) {
  const words = normalizeWhitespace(text).split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxChunkSize) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    current = word;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitIntoSemanticUnits(text, maxChunkSize) {
  return splitIntoParagraphs(text).flatMap((paragraph) => {
    if (paragraph.length <= maxChunkSize) {
      return [paragraph];
    }

    return splitIntoSentences(paragraph).flatMap((sentence) => {
      if (sentence.length <= maxChunkSize) {
        return [sentence];
      }

      return splitLongText(sentence, maxChunkSize);
    });
  });
}

function countApproximateTokens(text) {
  return Math.ceil(normalizeWhitespace(text).length / 4);
}

function createChunk(content, index, metadata = {}) {
  return {
    index,
    content,
    tokenCount: countApproximateTokens(content),
    metadata,
  };
}

function appendUnit(chunks, current, unit, targetChunkSize, maxChunkSize) {
  if (!current) {
    return unit;
  }

  const separator = current.includes('\n\n') || unit.includes('\n\n') ? '\n\n' : ' ';
  const next = `${current}${separator}${unit}`;

  if (next.length <= maxChunkSize && (current.length < targetChunkSize || next.length <= targetChunkSize)) {
    return next;
  }

  chunks.push(current);
  return unit;
}

function mergeSmallChunks(chunks, minChunkSize, maxChunkSize) {
  if (chunks.length <= 1) {
    return chunks;
  }

  return chunks.reduce((merged, chunk) => {
    const previous = merged[merged.length - 1];

    if (!previous) {
      merged.push(chunk);
      return merged;
    }

    const candidate = `${previous}\n\n${chunk}`;

    if ((chunk.length < minChunkSize || previous.length < minChunkSize) && candidate.length <= maxChunkSize) {
      merged[merged.length - 1] = candidate;
      return merged;
    }

    merged.push(chunk);
    return merged;
  }, []);
}

function getOverlapText(text, overlapSize) {
  if (!overlapSize || overlapSize < 1) {
    return '';
  }

  const sentences = splitIntoSentences(text);
  let overlap = '';

  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const candidate = overlap ? `${sentences[index]} ${overlap}` : sentences[index];

    if (candidate.length > overlapSize && overlap) {
      break;
    }

    overlap = candidate;

    if (overlap.length >= overlapSize) {
      break;
    }
  }

  if (!overlap || overlap.length > overlapSize * 1.5) {
    const words = normalizeWhitespace(text).split(/\s+/);
    overlap = '';

    for (let index = words.length - 1; index >= 0; index -= 1) {
      const candidate = overlap ? `${words[index]} ${overlap}` : words[index];

      if (candidate.length > overlapSize && overlap) {
        break;
      }

      overlap = candidate;
    }
  }

  return overlap.trim();
}

function addOverlap(chunks, overlapSize, maxChunkSize) {
  if (chunks.length <= 1 || overlapSize < 1) {
    return chunks;
  }

  return chunks.map((chunk, index) => {
    if (index === 0) {
      return chunk;
    }

    const overlap = getOverlapText(chunks[index - 1], overlapSize);

    if (!overlap || chunk.startsWith(overlap) || overlap === chunk) {
      return chunk;
    }

    const candidate = `${overlap}\n\n${chunk}`;
    return candidate.length <= maxChunkSize ? candidate : chunk;
  });
}

class ChunkingService {
  chunkText(text, options = {}) {
    const targetChunkSize = options.targetChunkSize || options.chunkSize || DEFAULT_TARGET_CHUNK_SIZE;
    const maxChunkSize = Math.max(
      options.maxChunkSize || options.chunkSize || Math.max(targetChunkSize, DEFAULT_MAX_CHUNK_SIZE),
      targetChunkSize
    );
    const minChunkSize = Math.min(
      options.minChunkSize || DEFAULT_MIN_CHUNK_SIZE,
      Math.floor(targetChunkSize / 2)
    );
    const chunkOverlap = Math.min(options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP, maxChunkSize - 1);
    const metadata = options.metadata || {};
    const normalizedText = normalizeParagraphText(text);

    if (!normalizedText) {
      return [];
    }

    const units = splitIntoSemanticUnits(normalizedText, maxChunkSize);
    const rawChunks = [];
    let current = '';

    for (const unit of units) {
      current = appendUnit(rawChunks, current, unit, targetChunkSize, maxChunkSize);
    }

    if (current) {
      rawChunks.push(current);
    }

    const mergedChunks = mergeSmallChunks(rawChunks, minChunkSize, maxChunkSize);
    const overlappedChunks = addOverlap(mergedChunks, chunkOverlap, maxChunkSize);

    return overlappedChunks.map((content, index) => createChunk(content, index, metadata));
  }
}

export {
  DEFAULT_TARGET_CHUNK_SIZE as DEFAULT_CHUNK_SIZE,
  DEFAULT_MAX_CHUNK_SIZE,
  DEFAULT_MIN_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_TARGET_CHUNK_SIZE,
  countApproximateTokens,
  normalizeWhitespace,
};
export default new ChunkingService();
