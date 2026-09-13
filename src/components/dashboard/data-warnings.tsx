"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/components/workspace-context";
import { hrefWithScopeAndStore } from "@/lib/scope-query";

type DataWarningsProps = {
  cogsIncomplete: boolean;
  missingCogsCount: number;
  missingCogsMessage?: string;
  missingAdSpendDays: number;
  adsHref?: string;
  cogsHref?: string;
};

function DataWarningsContent({
  cogsIncomplete,
  missingCogsCount,
  missingCogsMessage,
  missingAdSpendDays,
  cogsHref,
  adsHref,
}: DataWarningsProps & { cogsHref: string; adsHref: string }) {
  if (!cogsIncomplete && missingAdSpendDays <= 0) return null;

  const cogsText =
    missingCogsMessage ||
    (missingCogsCount === 1
      ? "1 COGS em falta"
      : `${missingCogsCount} COGS em falta`);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {cogsIncomplete && (
        <p>
          <span className="text-warning">·</span> {cogsText}{" "}
          <Link
            href={cogsHref}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Custos
          </Link>
        </p>
      )}
      {missingAdSpendDays > 0 && (
        <p>
          <span className="text-warning">·</span>{" "}
          {missingAdSpendDays === 1
            ? "1 dia sem ad spend"
            : `${missingAdSpendDays} dias sem ad spend`}{" "}
          <Link
            href={adsHref}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Anúncios
          </Link>
        </p>
      )}
    </div>
  );
}

function DataWarningsWithSearchParams(props: DataWarningsProps) {
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();
  const cogsHref =
    props.cogsHref ??
    hrefWithScopeAndStore("/cogs", searchParams, workspaceId);
  const adsHref =
    props.adsHref ??
    hrefWithScopeAndStore("/anuncios", searchParams, workspaceId);

  return (
    <DataWarningsContent
      {...props}
      cogsHref={cogsHref}
      adsHref={adsHref}
    />
  );
}

export function DataWarnings(props: DataWarningsProps) {
  if (props.cogsHref && props.adsHref) {
    return (
      <DataWarningsContent
        {...props}
        cogsHref={props.cogsHref}
        adsHref={props.adsHref}
      />
    );
  }

  return (
    <Suspense fallback={null}>
      <DataWarningsWithSearchParams {...props} />
    </Suspense>
  );
}
