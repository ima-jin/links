'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildPublicUrl } from '@ima-jin/config';

/**
 * A minimal, arms-length header. Replaces `@imajin/ui`'s shared `NavBar`
 * (which assumes deep, first-party knowledge of every Imajin service) with a
 * small self-contained sign-in-status indicator, built the same way the
 * public landing page already checks the caller's session: a direct,
 * credentialed fetch of the kernel's own public `/api/session` route. See
 * the PR's DECISION note for why this app no longer depends on `@imajin/ui`.
 */
export function Header() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const authUrl = buildPublicUrl('auth');

  useEffect(() => {
    let cancelled = false;

    fetch(`${authUrl}/api/session`, { credentials: 'include' })
      .then((response) => {
        if (!cancelled) setSignedIn(response.ok);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUrl]);

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        🔗 Links
      </Link>
      {signedIn !== null && (signedIn ? (
        <Link href="/dashboard" className="text-sm font-medium text-orange-500 hover:underline">
          Dashboard
        </Link>
      ) : (
        <a
          href={`${authUrl}/login?next=${encodeURIComponent(globalThis.location?.href ?? '/')}`}
          className="text-sm font-medium text-orange-500 hover:underline"
        >
          Sign in
        </a>
      ))}
    </header>
  );
}
