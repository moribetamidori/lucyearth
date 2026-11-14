import { assertSameOrigin, describeMe, errorResponse, restoreUser } from '@/lib/pcea/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    return Response.json(await describeMe(await restoreUser(body?.code)));
  } catch (error) { return errorResponse(error); }
}
