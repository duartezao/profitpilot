import type { Metadata } from "next";
import { Scale } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";

export const metadata: Metadata = { title: "Decisão" };
export const dynamic = "force-dynamic";

export default async function DecisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  const { store: storeId } = await searchParams;
  await connectToDatabase();

  const scoped = storeId
    ? await Store.findOne({
        _id: storeId,
        workspaceId: user?.workspaceId,
        deletedAt: null,
      })
        .select("name")
        .lean()
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {scoped ? `Decisão · ${scoped.name}` : "Decisão"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {scoped
            ? "O que fazer hoje nesta loja: escalar, manter ou cortar."
            : "O que fazer hoje em todas as lojas: prioridades e semáforos."}
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface p-12 text-center">
        <Scale className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Apoio à decisão em desenvolvimento.</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {scoped
            ? "Vai cruzar lucro real, BER e ad spend desta loja para recomendar Kill / Scale / Manter por produto e campanha."
            : "Vai cruzar lucro real, BER e ad spend para recomendar Kill / Scale / Manter por loja, produto e campanha."}
          {" "}Disponível depois de ligares os anúncios.
        </p>
      </div>
    </div>
  );
}
