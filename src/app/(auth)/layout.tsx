import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Já autenticado? Vai direto para a app (sessão persistente).
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded" />
          <span className="text-lg font-semibold tracking-tight">
            Profit<span className="text-accent">Pilot</span>
          </span>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
