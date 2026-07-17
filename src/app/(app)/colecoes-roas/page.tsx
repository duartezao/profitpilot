import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { ColecoesRoasClient } from "./colecoes-roas-client";

export const metadata: Metadata = { title: "ROAS por coleção" };

export default async function ColecoesRoasPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { store: storeId } = await searchParams;
  if (!storeId) redirect("/dashboard");
  if (!canAccessStore(user.storeAccess, storeId)) redirect("/dashboard");

  return (
    <Suspense fallback={null}>
      <ColecoesRoasClient storeId={storeId} />
    </Suspense>
  );
}
