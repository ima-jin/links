/**
 * Prefix a same-origin absolute path with the app's basePath.
 *
 * Next.js auto-prefixes `<Link>` and `router.push`, but NOT raw `fetch()`,
 * `<a href>`, `redirect()`, or `NextResponse.redirect()` calls. Route those
 * through this helper so they resolve correctly when the app is mounted
 * under a non-root basePath (`/links`, see next.config.js).
 */
export function withBasePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '/links';
  if (path === '/') return base;
  return `${base}${path}`;
}
