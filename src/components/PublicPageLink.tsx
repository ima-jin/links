import { publicPageUrl } from '@/lib/public-url';

/** Shows the page's public URL (`${NEXT_PUBLIC_APP_URL}/{handle}`) as a link that opens it. */
export function PublicPageLink({ handle }: Readonly<{ handle: string }>) {
  const url = publicPageUrl(handle);
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-orange-500 hover:underline">
      {url}
    </a>
  );
}
