/**
 * Public URL of a links page, derived from `NEXT_PUBLIC_APP_URL`.
 *
 * `NEXT_PUBLIC_APP_URL` already carries the reverse-proxy base path
 * (`https://jin.imajin.ai/links`, `https://dev-jin.imajin.ai/links`), so a
 * page lives at `${NEXT_PUBLIC_APP_URL}/{handle}` — never at the origin root.
 *
 * Client components use this too, so the variable must be read with a literal
 * `process.env.NEXT_PUBLIC_APP_URL` access (Next.js inlines it at build time;
 * a dynamic `process.env[name]` lookup would be empty in the browser). There is
 * deliberately no fallback host: a missing or invalid value throws, and
 * `scripts/check-env.mjs` rejects it at deploy time.
 */

function appBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set — see .env.example.');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL is not a valid URL — see .env.example.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must be an http(s) URL — see .env.example.');
  }
  return url;
}

/** Absolute public URL for a page handle, e.g. https://dev-jin.imajin.ai/links/veteze. */
export function publicPageUrl(handle: string): string {
  const base = appBaseUrl();
  let end = base.pathname.length;
  while (end > 0 && base.pathname[end - 1] === '/') end -= 1;
  const basePath = base.pathname.slice(0, end);
  return `${base.origin}${basePath}/${encodeURIComponent(handle)}`;
}
