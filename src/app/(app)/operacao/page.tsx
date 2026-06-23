import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OperacaoClient } from "./operacao-client";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { buildOperationsTodayHub } from "@/lib/operation-today";

export const metadata: Metadata = { title: "Hoje · Operação" };

export default async function OperacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const data = await buildOperationsTodayHub(user, params.store ?? null);
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return <OperacaoClient data={data} canEdit={canEdit} />;
}
