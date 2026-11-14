import { errorResponse, routeForDay } from '@/lib/pcea/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const route = await routeForDay(new URL(request.url).searchParams.get('date'));
    return Response.json(route, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
