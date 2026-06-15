import Link from "next/link";

export function DataWarnings({
  cogsIncomplete,
  missingCogsCount,
  missingCogsMessage,
  missingAdSpendDays,
  cogsHref = "/cogs",
  adsHref = "/anuncios",
}: {
  cogsIncomplete: boolean;
  missingCogsCount: number;
  missingCogsMessage?: string;
  missingAdSpendDays: number;
  cogsHref?: string;
  adsHref?: string;
}) {
  if (!cogsIncomplete && missingAdSpendDays <= 0) return null;

  const cogsText =
    missingCogsMessage ||
    (missingCogsCount === 1
      ? "1 produto sem COGS neste período."
      : `${missingCogsCount} produtos sem COGS neste período.`);

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
