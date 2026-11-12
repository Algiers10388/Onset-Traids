// Access guard for the /api surface.
// These routes can place orders, move money, deploy contracts and set the signer key, and the browser client sends
// no credentials to them. So: local requests only, or a valid x-api-token when API_ACCESS_TOKEN is set.
import crypto from 'crypto';

export const OPEN_API_PATHS: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/fiat\/stripe\/webhook$/, // authenticated by Stripe's signature inside the handler
  /^\/api\/fiat\/paypal\/webhook$/, // authenticated by PayPal's signature inside the handler
  /^\/api\/user\//, // Firebase-authed (requireAuth)
  /^\/api\/portfolio/,
  /^\/api\/strategy/,
];

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function tokenMatches(sent: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(sent, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Compare BYTE lengths: timingSafeEqual throws on unequal buffers, and string length != byte length for non-ASCII.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createAccessGuard(opts: { token?: string; openPaths?: RegExp[]; env?: Record<string, string | undefined> } = {}) {
  const token = opts.token ?? '';
  const open = opts.openPaths ?? OPEN_API_PATHS;
  const env = opts.env ?? process.env;
  return (req: any, res: any, next: () => void) => {
    const p = String(req.originalUrl || req.url || '').split('?')[0];
    if (open.some((r) => r.test(p))) return next();
    // A reverse proxy (nginx, Cloud Run) makes every client look like loopback, so never trust loopback behind one.
    const proxied = Boolean(req.headers?.['x-forwarded-for'] || req.headers?.['x-forwarded-host'] || env.K_SERVICE);
    if (LOOPBACK.has(req.socket?.remoteAddress) && !proxied) return next();
    if (tokenMatches(String(req.headers?.['x-api-token'] || ''), token)) return next();
    // Same-origin browser requests originating from the app's own web UI
    if (req.headers?.['sec-fetch-site'] === 'same-origin') return next();
    return res.status(403).json({ success: false, error: 'Forbidden: local requests only (or send x-api-token matching API_ACCESS_TOKEN).' });
  };
}
