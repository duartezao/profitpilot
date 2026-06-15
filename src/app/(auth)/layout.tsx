import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppLogo } from "@/components/app-logo";

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
        <div className="mb-6 flex items-center justify-center">
          <AppLogo className="text-lg" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
