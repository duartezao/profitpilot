import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { switchWorkspace } from "@/lib/auth";
import { authErrorResponse, requireUser } from "@/lib/require-auth";

const bodySchema = z.object({
  workspaceId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    await requireUser();

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

    await switchWorkspace(parsed.data.workspaceId);

    revalidatePath("/", "layout");

    return NextResponse.json({ ok: true, workspaceId: parsed.data.workspaceId });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Sem acesso")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return authErrorResponse(e);
  }
}
