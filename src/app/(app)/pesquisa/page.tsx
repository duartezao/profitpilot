import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PesquisaClient } from "./pesquisa-client";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { listResearchItems } from "@/lib/research";
import type { ResearchKind, ResearchStatus } from "@/lib/research-types";

export const metadata: Metadata = {
  title: "Pesquisa PR · ProfitPilot",
};

export default async function PesquisaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    status?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const kind =
    sp.kind === "product" || sp.kind === "collection"
      ? (sp.kind as ResearchKind)
      : "all";
  const status = (
    [
      "new",
      "shortlist",
      "testing",
      "winner",
      "rejected",
    ] as ResearchStatus[]
  ).includes(sp.status as ResearchStatus)
    ? (sp.status as ResearchStatus)
    : "all";

  const rows = await listResearchItems(user, {
    q: sp.q,
    kind,
    status,
  });
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return (
    <PesquisaClient
      rows={rows}
      canEdit={canEdit}
      initialQ={sp.q ?? ""}
      initialKind={kind}
      initialStatus={status}
    />
  );
}
