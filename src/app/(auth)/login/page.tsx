import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "../login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Entrar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Acede ao teu ProfitPilot.
      </p>
      <LoginForm />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Não tens conta?{" "}
        <Link href="/registo" className="font-medium text-accent">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
