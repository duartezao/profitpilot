"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    registerAction,
    {},
  );

  return (
    <form action={action} className="mt-5 space-y-3">
      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">Nome</label>
        <input name="name" type="text" autoComplete="name" required className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Utilizador{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <input
          name="username"
          type="text"
          autoComplete="username"
          placeholder="nome.unico"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Único na plataforma — 3–30 caracteres (a-z, 0-9, . _ -).
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Email{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <input name="email" type="email" autoComplete="email" className={inputCls} />
      </div>
      <p className="text-xs text-muted-foreground">
        Preenche <strong className="font-medium text-foreground">email ou utilizador</strong>{" "}
        (pelo menos um) para entrar.
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Nome do workspace <span className="text-muted-foreground">(opcional)</span>
        </label>
        <input
          name="workspaceName"
          type="text"
          placeholder="As minhas lojas"
          className={inputCls}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "A criar conta…" : "Criar conta"}
      </button>
    </form>
  );
}
