import { stat } from 'fs/promises';
import path from 'path';
import env from '../../../config/env.js';
import { readJsonFileOrDefault } from '../../../utils/fs.utils.js';

const DEFAULT_RESULTS_FILE = 'tmp/ai-eval-results.json';

function resolveResultsFile(configuredPath) {
  const projectRoot = path.resolve(process.cwd());
  const resultsFile = path.resolve(projectRoot, configuredPath || DEFAULT_RESULTS_FILE);
  const relativePath = path.relative(projectRoot, resultsFile);

  if (
    relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    throw new Error('AI evaluation results file must be inside the project directory.');
  }

  return resultsFile;
}

function snapshotsFromPayload(payload, fallbackTimestamp) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.runs)
      ? payload.runs
      : Array.isArray(payload?.snapshots)
        ? payload.snapshots
        : payload && typeof payload === 'object'
          ? [payload]
          : [];

  return candidates.map((snapshot) => ({
    ...snapshot,
    timestamp: snapshot?.timestamp
      || snapshot?.generatedAt
      || snapshot?.createdAt
      || snapshot?.run?.timestamp
      || fallbackTimestamp,
  }));
}

class AiQualityRepository {
  constructor({
    resultsFile = env.aiEvalResultsFile,
    readJson = readJsonFileOrDefault,
    getFileStat = stat,
  } = {}) {
    this.resultsFile = resolveResultsFile(resultsFile);
    this.readJson = readJson;
    this.getFileStat = getFileStat;
  }

  async getEvaluationSnapshots() {
    const payload = await this.readJson(this.resultsFile, null);
    if (payload === null) return [];

    const snapshots = snapshotsFromPayload(payload, null);
    if (snapshots.every((snapshot) => snapshot.timestamp)) {
      return snapshots;
    }

    let fallbackTimestamp = null;
    try {
      fallbackTimestamp = (await this.getFileStat(this.resultsFile)).mtime.toISOString();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    return snapshotsFromPayload(payload, fallbackTimestamp);
  }
}

export {
  AiQualityRepository,
  DEFAULT_RESULTS_FILE,
  resolveResultsFile,
  snapshotsFromPayload,
};
export default new AiQualityRepository();
