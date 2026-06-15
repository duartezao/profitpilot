import type { Metadata } from "next";
import { TreasuryClient } from "./treasury-client";

export const metadata: Metadata = { title: "Tesouraria" };
export const dynamic = "force-dynamic";

export default function TesourariaPage() {
  return <TreasuryClient />;
}
