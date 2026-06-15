import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildWorkspaceTreasury } from "@/lib/treasury";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const storeId = new URL(request.url).searchParams.get("store") ?? undefined;
  const treasury = await buildWorkspaceTreasury(user.workspaceId, storeId);

  return NextResponse.json(treasury, {
    headers: { "Cache-Control": "no-store" },
  });
}
