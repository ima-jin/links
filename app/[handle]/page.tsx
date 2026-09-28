import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, and, asc } from 'drizzle-orm';
import { getSession } from '@ima-jin/auth';
import { buildPublicUrl } from '@ima-jin/config';
import { db, linkPages, links } from '@/db';
import LinkButton from './link-button';

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata(props: Readonly<PageProps>): Promise<Metadata> {
  const params = await props.params;
  const page = await db.query.linkPages.findFirst({ where: eq(linkPages.handle, params.handle) });

  if (!page?.isPublic) {
    return { title: 'Links | Imajin' };
  }

  const title = `${page.title} | Links | Imajin`;
  const description = page.bio || 'Sovereign link-in-bio page on the Imajin network';
  const url = `${buildPublicUrl('links')}/${page.handle}`;
  const avatarIsImage = page.avatar && (page.avatar.startsWith('http') || page.avatar.startsWith('/'));
  const ogImage = avatarIsImage
    ? (page.avatar!.startsWith('http') ? page.avatar! : `${buildPublicUrl('links')}${page.avatar}`)
    : null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'Imajin',
      type: 'profile',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

interface Theme {
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonStyle?: 'rounded' | 'square' | 'pill';
}

const BORDER_RADIUS: Record<NonNullable<Theme['buttonStyle']>, string> = {
  rounded: '0.75rem',
  square: '0.25rem',
  pill: '9999px',
};

export default async function LinksPage(props: Readonly<PageProps>) {
  const params = await props.params;
  const page = await db.query.linkPages.findFirst({ where: eq(linkPages.handle, params.handle) });

  if (!page?.isPublic) {
    notFound();
  }

  const pageLinks = await db
    .select()
    .from(links)
    .where(and(eq(links.pageId, page.id), eq(links.isActive, true)))
    .orderBy(asc(links.position));

  // getSession() forwards the shared kernel session cookie to the kernel's
  // own /api/session route — the same mechanism authenticate() falls back
  // to for API routes (see src/lib/auth/authenticate.ts).
  const session = await getSession();
  const isAuthenticated = !!session;

  const visibleLinks = pageLinks.filter((link) => link.visibility !== 'authenticated' || isAuthenticated);

  const theme: Theme = (page.theme as Theme) || {};
  const bgColor = theme.backgroundColor || '#1a1a1a';
  const textColor = theme.textColor || '#ffffff';
  const buttonColor = theme.buttonColor || '#ff8c00';
  const buttonTextColor = theme.buttonTextColor || '#000000';
  const buttonStyle = theme.buttonStyle || 'pill';
  const borderRadius = BORDER_RADIUS[buttonStyle];

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          {page.avatar?.startsWith('http') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.avatar} alt={page.title} className="w-24 h-24 rounded-full mx-auto object-cover mb-4" />
          ) : (
            <div
              className="w-24 h-24 rounded-full mx-auto flex items-center justify-center text-4xl mb-4"
              style={{ backgroundColor: `${buttonColor}30` }}
            >
              {page.avatar || '🔗'}
            </div>
          )}

          <h1 className="text-2xl font-bold mb-2">{page.title}</h1>

          {page.bio && <p className="opacity-80 mb-6">{page.bio}</p>}
        </div>

        <div className="space-y-3">
          {visibleLinks.map((link) => (
            <LinkButton
              key={link.id}
              link={link}
              buttonColor={buttonColor}
              buttonTextColor={buttonTextColor}
              borderRadius={borderRadius}
            />
          ))}
        </div>

        <div className="mt-12 text-center opacity-50 text-sm">
          <Link href="/" className="hover:opacity-100 transition">
            ⚡ Powered by Imajin
          </Link>
        </div>
      </div>
    </div>
  );
}
