import { Package } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { TopProduct } from "@/lib/metrics";

export function ProductsProfitTable({ products }: { products: TopProduct[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">Produtos por lucro</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-5 py-3">Produto</th>
              <th className="px-5 py-3 text-right">Vendas</th>
              <th className="px-5 py-3 text-right">Margem</th>
              <th className="px-5 py-3 text-right">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-8 text-center text-sm text-muted-foreground"
                >
                  Sem produtos no período. Sincroniza a loja.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.title}
                  className="border-t border-border hover:bg-muted"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted"
                      >
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Sensitive className="block truncate font-medium">
                        {p.title}
                      </Sensitive>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <Sensitive>{p.units}</Sensitive>
                  </td>
                  <td
                    className={`px-5 py-3 text-right tabular-nums ${p.marginPositive ? "text-positive" : "text-negative"}`}
                  >
                    <Sensitive>{p.margin}</Sensitive>
                  </td>
                  <td
                    className={`px-5 py-3 text-right tabular-nums ${p.positive ? "text-positive" : "text-negative"}`}
                  >
                    <Sensitive>{p.profit}</Sensitive>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
