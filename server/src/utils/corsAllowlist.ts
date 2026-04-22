/**
 * Shared CORS origin logic for Express + Socket.IO.
 * - FRONTEND_URL: comma-separated exact origins (no trailing slash).
 * - In production, if any entry uses Cloudflare Pages (*.pages.dev), also allow
 *   any https://*.pages.dev origin (previews use different hostnames).
 *   Set CORS_STRICT_CLOUDFLARE=true to disable that wildcard.
 */

export const normalizeOrigin = (value: string) => {
  let v = value.trim().replace(/\/$/, '');
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
};

const isHttpsCloudflarePages = (origin: string) =>
  /^https:\/\/.+\.pages\.dev$/i.test(origin) && !/\s/.test(origin);

export type CorsOriginCb = (err: Error | null, allow?: boolean) => void;

let didLog = false;

export function createCorsOriginChecker(): (origin: string | undefined, cb: CorsOriginCb) => void {
  const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const isProd = process.env.NODE_ENV === 'production';
  const originAllowlist = new Set([...allowedOrigins, ...(isProd ? [] : devOrigins)]);

  const allowCfPagesFamily =
    isProd &&
    process.env.CORS_STRICT_CLOUDFLARE !== 'true' &&
    allowedOrigins.some((o) => o.includes('.pages.dev'));

  if (!didLog) {
    didLog = true;
    if (isProd && originAllowlist.size > 0) {
      console.log('[CORS] Allowed origins:', [...originAllowlist].join(', '));
      if (allowCfPagesFamily) {
        console.log('[CORS] Also allowing any https://*.pages.dev (Cloudflare Pages / previews).');
      }
    } else if (isProd && originAllowlist.size === 0) {
      console.warn('[CORS] FRONTEND_URL is empty — allowing any origin (set FRONTEND_URL for production).');
    }
  }

  return (origin: string | undefined, cb: CorsOriginCb) => {
    if (!origin) return cb(null, true);
    const cleaned = normalizeOrigin(origin);
    if (originAllowlist.size === 0) return cb(null, true);
    if (originAllowlist.has(cleaned)) return cb(null, true);
    if (allowCfPagesFamily && isHttpsCloudflarePages(cleaned)) return cb(null, true);
    console.warn('[CORS] Blocked origin:', cleaned, '| allowlist:', [...originAllowlist].join(', '));
    return cb(null, false);
  };
}
