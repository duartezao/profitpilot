"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/components/workspace-context";
import { hrefWithScopeAndStore } from "@/lib/scope-query";

function DataWarningsInner({
  cogsIncomplete,
  missingCogsCount,
  missingCogsMessage,
  missingAdSpendDays,
  adsHref: adsHrefProp,
}: {
  cogsIncomplete: boolean;
  missingCogsCount: number;
  missingCogsMessage?: string;
  missingAdSpendDays: number;
  adsHref?: string;
}) {
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();
  const cogsHref = hrefWithScopeAndStore("/cogs", searchParams, workspaceId);
  const adsHref =
    adsHrefProp ?? hrefWithScopeAndStore("/anuncios", searchParams, workspaceId);

  if (!cogsIncomplete && missingAdSpendDays <= 0) return null;

  const cogsText =
    missingCogsMessage ||
    (missingCogsCount === 1
      ? "1 entrada de COGS em falta neste período."
      : `${missingCogsCount} entradas de COGS em falta neste período.`);

  return (
    <div className="space-y-1">
      {cogsIncomplete && (
        <p className="text-sm text-muted-foreground">
          {cogsText}{" "}
          <Link
            href={cogsHref}
            className="font-medium text-accent hover:underline"
          >
            Gerir custos
          </Link>
        </p>
      )}

      {missingAdSpendDays > 0 && (
        <p className="text-sm text-muted-foreground">
          {missingAdSpendDays === 1
            ? "1 dia sem ad spend registado."
            : `${missingAdSpendDays} dias sem ad spend registado.`}{" "}
          <Link
            href={adsHref}
            className="font-medium text-accent hover:underline"
          >
            Preencher anúncios
          </Link>
        </p>
      )}
    </div>
  );
}

export function DataWarnings(
  props: Parameters<typeof DataWarningsInner>[0] & { cogsHref?: string },
) {
  return (
    <Suspense fallback={null}>
      <DataWarningsInner
        cogsIncomplete={props.cogsIncomplete}
        missingCogsCount={props.missingCogsCount}
        missingCogsMessage={props.missingCogsMessage}
        missingAdSpendDays={props.missingAdSpendDays}
        adsHref={props.adsHref}
      />
    </Suspense>
  );
}
