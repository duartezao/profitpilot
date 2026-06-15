import Link from "next/link";
import { AlertTriangle } from "lucide-react";

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

  const cogsLabel =
    missingCogsCount === 1
      ? "1 produto vendido sem custo neste período"
      : `${missingCogsCount} produtos vendidos sem custo neste período`;

  return (
    <div className="space-y-3">
      {cogsIncomplete && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-warning">
                COGS em falta neste período
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Há {cogsLabel}. Essas vendas entram com COGS = 0 e podem{" "}
                <span className="font-medium text-foreground">
                  superestimar
                </span>{" "}
                o lucro.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Nas restantes encomendas, o lucro usa o custo registado à data
                da venda. Só é fiável se estiver{" "}
                <span className="font-medium text-foreground">actualizado</span>
                : se o fornecedor mudou o preço e ainda não reflectiste isso na
                Shopify ou em COGS, o valor pode ficar desfasado da realidade
                (não necessariamente superestimado).
              </p>
              <Link
                href={cogsHref}
                className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
              >
                Gerir custos (COGS)
              </Link>
            </div>
          </div>
        </div>
      )}

      {missingAdSpendDays > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-warning">
                Ad spend em falta
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {missingAdSpendDays === 1
                  ? "Falta 1 dia de gasto em ads"
                  : `Faltam ${missingAdSpendDays} dias de gasto em ads`}{" "}
                desde a data de importação. O ROAS e o lucro podem estar
                incorretos.
              </p>
              <Link
                href={adsHref}
                className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
              >
                Preencher anúncios
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
