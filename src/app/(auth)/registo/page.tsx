import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "../register-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Criar conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Começa a controlar o lucro real das tuas lojas.
      </p>
      <RegisterForm />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Já tens conta?{" "}
        <Link href="/login" className="font-medium text-accent">
          Entrar
        </Link>
      </p>
    </div>
  );
}
