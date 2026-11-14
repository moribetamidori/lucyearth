import { assertSameOrigin, createEvent, errorResponse, listEvents, requireUser } from '@/lib/pcea/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const events = await listEvents(url.searchParams.get('from'), url.searchParams.get('to'));
    return Response.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return Response.json({ id: await createEvent(user, await request.json()) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
