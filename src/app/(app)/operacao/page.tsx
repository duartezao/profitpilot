import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OperacaoClient } from "./operacao-client";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { buildOperationsOverview } from "@/lib/operations";

export const metadata: Metadata = { title: "Operação" };

export default async function OperacaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await buildOperationsOverview(user);
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return <OperacaoClient data={data} canEdit={canEdit} />;
}
