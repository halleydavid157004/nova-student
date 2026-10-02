// A process-wide budget protects free provider quotas even behind a proxy.
// It deliberately does not trust client-supplied forwarding headers.
export function createRequestBudget({limit, windowMs, maxConcurrent = Infinity}) {
  let used = 0, active = 0, resetsAt = 0;
  return () => {
    const now = Date.now();
    if (now >= resetsAt) { used = 0; resetsAt = now + windowMs; }
    if (active >= maxConcurrent || used >= limit) {
      return {retryAfter: active >= maxConcurrent ? 15 : Math.max(1, Math.ceil((resetsAt - now) / 1000))};
    }
    used++; active++;
    let released = false;
    return {release() { if (!released) { released = true; active--; } }};
  };
}

// Identity for report de-duplication only (never for authorization). Behind Render's proxy the
// socket address is the proxy itself, so every visitor would count as one reporter; Render
// appends the client address it saw as the last X-Forwarded-For entry, which a client cannot forge.
export function clientAddress(req, env = process.env) {
  const socket = req.socket?.remoteAddress || 'unknown';
  if (env.RENDER !== 'true') return socket;
  const last = String(req.headers?.['x-forwarded-for'] || '').split(',').pop().trim();
  return /^[0-9a-f:.]{2,45}$/i.test(last) ? last : socket;
}
