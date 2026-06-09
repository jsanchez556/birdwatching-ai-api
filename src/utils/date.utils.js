function toIsoDateOnly(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export {
  toIsoDateOnly,
};
