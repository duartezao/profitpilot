import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { getCompetitorMapData } from "@/lib/competitor-ads/discovery";
import { MapaClient } from "./mapa-client";

export const metadata: Metadata = {
  title: "Mapa competitors · Pesquisa PR · ProfitPilot",
};

export const dynamic = "force-dynamic";

export default async function PesquisaMapaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await getCompetitorMapData(user.workspaceId);
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Mapa competitors (Google Ads)
        </h1>
      </header>
      <MapaClient
        companies={data.companies}
        domains={data.domains}
        links={data.links}
        byCountry={data.byCountry}
        canEdit={canEdit}
      />
    </div>
  );
}
