function normalizeLicense(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('all rights reserved')) {
    return 'all rights reserved';
  }

  if (normalized.includes('no rights reserved')) {
    return 'cc0';
  }

  const directMatch = normalized.match(/^cc[-\s]by(?:[-\s]nc)?(?:[-\s]sa)?(?:[-\s]nd)?$/i);

  if (directMatch) {
    return directMatch[0].toLowerCase().replaceAll(/\s+/g, '-');
  }

  const attributionMatch = normalized.match(/\((cc[-\s]by(?:[-\s]nc)?(?:[-\s]sa)?(?:[-\s]nd)?)\)/i);

  if (attributionMatch) {
    return attributionMatch[1].toLowerCase().replaceAll(/\s+/g, '-');
  }

  try {
    const parts = new URL(normalized).pathname.split('/').filter(Boolean);
    const licenseIndex = parts.indexOf('licenses');
    const code = parts[licenseIndex + 1];

    if (licenseIndex !== -1 && code) {
      return `cc-${code.toLowerCase()}`;
    }
  } catch {
    return null;
  }

  return null;
}

export {
  normalizeLicense,
};
