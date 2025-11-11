import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const OSM_SUBDOMAINS = ['a', 'b', 'c'] as const;

interface TileParams {
  tile?: string[];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: TileParams }
) {
  const segments = params.tile;

  if (!segments || segments.length !== 3) {
    return NextResponse.json(
      { error: 'Invalid tile path. Expected /{z}/{x}/{y}.png' },
      { status: 400 }
    );
  }

  const [z, x, y] = segments;

  if (!/^\d+$/.test(z) || !/^\d+$/.test(x)) {
    return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 });
  }

  const subdomain =
    OSM_SUBDOMAINS[Math.floor(Math.random() * OSM_SUBDOMAINS.length)];
  const upstreamUrl = `https://${subdomain}.tile.openstreetmap.org/${z}/${x}/${y}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'LucyEarth-TileProxy/1.0 (contact: support@lucyearth.system)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return NextResponse.json(
        { error: 'Failed to load map tile' },
        { status: upstreamResponse.status || 502 }
      );
    }

    const headers = new Headers();
    const contentType = upstreamResponse.headers.get('content-type') ?? 'image/png';

    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

    const etag = upstreamResponse.headers.get('etag');
    if (etag) headers.set('ETag', etag);

    const lastModified = upstreamResponse.headers.get('last-modified');
    if (lastModified) headers.set('Last-Modified', lastModified);

    return new NextResponse(upstreamResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Tile proxy error:', error);
    return NextResponse.json(
      { error: 'Unexpected error while proxying tile request' },
      { status: 500 }
    );
  }
}
