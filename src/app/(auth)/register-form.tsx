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
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input name="email" type="email" autoComplete="email" required className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputCls}
        />
        <p className="mt-1 text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
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
