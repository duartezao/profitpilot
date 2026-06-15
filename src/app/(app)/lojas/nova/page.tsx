import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, listStoreWritableWorkspaces } from "@/lib/auth";
import { AddStoreForm } from "../add-store-form";

export const metadata: Metadata = { title: "Adicionar loja" };

export default async function NovaLojaPage() {
  const user = await getCurrentUser();
  const workspaces = user
    ? await listStoreWritableWorkspaces(user.id)
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/lojas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar às lojas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Adicionar loja
        </h1>
        <p className="text-sm text-muted-foreground">
          Liga uma loja Shopify com o ID de cliente e a Chave secreta da tua app
          (Dev Dashboard). Escolhe o workspace onde a loja fica.
        </p>
      </div>

      <AddStoreForm
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
        defaultWorkspaceId={user?.workspaceId ?? ""}
      />
    </div>
  );
}
