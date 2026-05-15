export function setSseHeaders(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

export function sendSseEvent(res, event, data = {}) {
  if (res.destroyed || res.writableEnded) {
    return false;
  }

  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  return true;
}

export function endSse(res) {
  if (!res.destroyed && !res.writableEnded) {
    res.end();
  }
}
