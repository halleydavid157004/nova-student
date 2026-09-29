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
