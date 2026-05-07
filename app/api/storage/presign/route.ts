import { NextRequest, NextResponse } from 'next/server';
import { createPresignedUploadUrl } from '@/lib/server/s3Storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bucket = typeof body.bucket === 'string' ? body.bucket : '';
    const path = typeof body.path === 'string' ? body.path : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType : '';
    const cacheControl = typeof body.cacheControl === 'string' ? body.cacheControl : undefined;
    const upsert = typeof body.upsert === 'boolean' ? body.upsert : undefined;

    if (!bucket || !path || !contentType) {
      return NextResponse.json({ error: 'Missing bucket, path, or contentType' }, { status: 400 });
    }

    const result = await createPresignedUploadUrl({
      bucket,
      path,
      contentType,
      cacheControl,
      upsert,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create upload URL';
    const status = message.includes('already exists') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
