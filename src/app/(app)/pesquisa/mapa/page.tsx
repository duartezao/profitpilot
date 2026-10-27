import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { getCompetitorMapData } from "@/lib/competitor-ads/discovery";
import { MapaClient } from "./mapa-client";

export const metadata: Metadata = {
  title: "Google Competitors · Pesquisa PR · ProfitPilot",
};

export const dynamic = "force-dynamic";

export default async function PesquisaMapaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await getCompetitorMapData(user.workspaceId);
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return (
    <div className="flex w-full min-w-0 flex-col">
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
