import Link from "next/link";
import { Mail } from "lucide-react";

export function PendingInvitesBanner({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <div className="border-b border-accent/30 bg-accent/10 px-4 py-2.5 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Mail className="h-4 w-4 shrink-0 text-accent" />
          Tens {count} {count === 1 ? "convite pendente" : "convites pendentes"}.
        </p>
        <Link
          href="/definicoes#convites"
          className="rounded-lg border border-accent/40 bg-surface px-3 py-1.5 text-sm font-medium text-accent hover:bg-muted"
        >
          Ver convites
        </Link>
      </div>
    </div>
  );
}
