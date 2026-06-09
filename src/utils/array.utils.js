function compactArray(values) {
  return values
    .flat()
    .filter((value) => value !== null && value !== undefined && value !== '');
}

function mergeTags(...tagLists) {
  return [...new Set(compactArray(tagLists))];
}

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export {
  chunkArray,
  compactArray,
  mergeTags,
};
