import Link from "next/link";

export function DataWarnings({
  cogsIncomplete,
  missingCogsCount,
  missingAdSpendDays,
  cogsHref = "/cogs",
  adsHref = "/anuncios",
}: {
  cogsIncomplete: boolean;
  missingCogsCount: number;
  missingAdSpendDays: number;
  cogsHref?: string;
  adsHref?: string;
}) {
  if (!cogsIncomplete && missingAdSpendDays <= 0) return null;

  return (
    <div className="space-y-1">
      {cogsIncomplete && (
        <p className="text-sm text-muted-foreground">
          {missingCogsCount === 1
            ? "1 produto sem COGS neste período."
            : `${missingCogsCount} produtos sem COGS neste período.`}{" "}
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
