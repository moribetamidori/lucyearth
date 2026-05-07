import { NextRequest, NextResponse } from 'next/server';
import { deleteObjectsFromS3 } from '@/lib/server/s3Storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bucket = typeof body.bucket === 'string' ? body.bucket : '';
    const paths = Array.isArray(body.paths)
      ? body.paths.filter((path: unknown): path is string => typeof path === 'string' && path.length > 0)
      : [];

    if (!bucket || paths.length === 0) {
      return NextResponse.json({ error: 'Missing bucket or paths' }, { status: 400 });
    }

    await deleteObjectsFromS3({ bucket, paths });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete storage objects';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
