import type { Metadata } from "next";
import { Suspense } from "react";
import { AnunciosClient } from "./anuncios-client";

export const metadata: Metadata = { title: "Anúncios" };

export default function AnunciosPage() {
  return (
    <Suspense fallback={null}>
      <AnunciosClient />
    </Suspense>
  );
}
