import { assertSameOrigin, describeMe, ensureUser, errorResponse, requireUser, updateProfile } from '@/lib/pcea/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sign in anonymously: returns the cookie's user, creating one on first visit. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    return Response.json(await describeMe(await ensureUser(body?.timezone)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return Response.json(await describeMe(await updateProfile(user, await request.json())));
  } catch (error) { return errorResponse(error); }
}
