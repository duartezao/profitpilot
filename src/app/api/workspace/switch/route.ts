import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, switchWorkspace } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  workspaceId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Workspace inválido." }, { status: 400 });
  }

  try {
    await switchWorkspace(parsed.data.workspaceId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não foi possível trocar." },
      { status: 403 },
    );
  }

  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, workspaceId: parsed.data.workspaceId });
}
