import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  authErrorResponse,
  requireRole,
  requireUser,
  requireWorkspaceStore,
} from "@/lib/require-auth";
import {
  cancelChunkedSync,
  getChunkedSyncStatus,
  runChunkedSyncStep,
  startChunkedSync,
} from "@/lib/store-sync-chunked";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROLES_THAT_CAN_EDIT = ["owner", "admin", "editor"] as const;

const bodySchema = z.object({
  action: z.enum(["start", "step", "cancel"]),
});

type RouteCtx = { params: Promise<{ storeId: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    const user = await requireUser();
    const { storeId } = await ctx.params;
    await requireWorkspaceStore(user, storeId, { activeOnly: true });
    requireRole(user, ROLES_THAT_CAN_EDIT);

    const status = await getChunkedSyncStatus(storeId);
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const user = await requireUser();
    const { storeId } = await ctx.params;
    await requireWorkspaceStore(user, storeId, { activeOnly: true });
    requireRole(user, ROLES_THAT_CAN_EDIT);

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Acção inválida." },
        { status: 400 },
      );
    }

    let status;
    switch (parsed.data.action) {
      case "start":
        status = await startChunkedSync(storeId);
        break;
      case "step":
        status = await runChunkedSyncStep(storeId);
        break;
      case "cancel":
        status = await cancelChunkedSync(storeId);
        break;
    }

    if (status.status === "done") {
      revalidatePath("/lojas");
      revalidatePath("/dashboard");
      revalidatePath("/payouts");
      revalidatePath("/tesouraria");
      revalidatePath("/metricas");
    }

    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
