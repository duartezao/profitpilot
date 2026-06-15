import { NextResponse } from "next/server";
import { buildPortfolioSummary, resolvePortfolioWorkspaceIds } from "@/lib/portfolio-metrics";
import {
  authErrorResponse,
  requireUser,
} from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const portfolio = params.get("portfolio");
    if (!portfolio) {
      return NextResponse.json(
        { error: "Parâmetro portfolio em falta." },
        { status: 400 },
      );
    }

    const ids = await resolvePortfolioWorkspaceIds(user.id, portfolio);
    if (ids.length < 2) {
      return NextResponse.json(
        {
          error:
            "Seleciona pelo menos 2 workspaces para a vista consolidada.",
        },
        { status: 400 },
      );
    }

    const summary = await buildPortfolioSummary(
      user.id,
      user.workspaceId,
      portfolio,
      {
        period: params.get("period"),
        from: params.get("from"),
        to: params.get("to"),
        dates: params.get("dates"),
      },
    );

    if (!summary) {
      return NextResponse.json(
        { error: "Vista portfolio indisponível." },
        { status: 400 },
      );
    }

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
