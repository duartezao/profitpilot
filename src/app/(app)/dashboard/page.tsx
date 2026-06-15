import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}>
      <DashboardClient />
    </Suspense>
  );
}
