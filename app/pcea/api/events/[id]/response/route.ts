import { assertSameOrigin, deleteResponse, errorResponse, requireUser, saveResponse } from '@/lib/pcea/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    await saveResponse(await requireUser(), (await params).id, await request.json());
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    await deleteResponse(await requireUser(), (await params).id);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
