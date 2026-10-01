// Shares the same lease, quotas and history as the scheduled radar.
process.env.RADAR_VALIDATE_ONLY='true';
await import('./radar.js');
