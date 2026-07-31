const ALLOWED_MEMORY_TYPES = new Set([
  'birding_preference',
  'accessibility_preference',
  'location_preference',
]);

function filterExtractedMemories(memories = []) {
  return (Array.isArray(memories) ? memories : []).filter((memory) => (
    ALLOWED_MEMORY_TYPES.has(memory?.memoryType)
    && typeof memory.content === 'string'
    && memory.content.trim()
  ));
}

export {
  ALLOWED_MEMORY_TYPES,
  filterExtractedMemories,
};
