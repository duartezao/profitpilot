"use client";

import { useState } from "react";
import { useActionState } from "react";
import { registerAction, type AuthState } from "./actions";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

type LoginMode = "username" | "email";

export function RegisterForm() {
  const [mode, setMode] = useState<LoginMode>("username");
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
        <p className="mb-2 text-sm font-medium">Como queres entrar?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("username")}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
              mode === "username"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            Utilizador
          </button>
          <button
            type="button"
            onClick={() => setMode("email")}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
              mode === "email"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            Email
          </button>
        </div>
      </div>

      {mode === "username" ? (
        <div>
          <label className="mb-1 block text-sm font-medium">Utilizador</label>
          <input
            name="username"
            type="text"
            autoComplete="username"
            required
            placeholder="nome.unico"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Único na plataforma — 3–30 caracteres (a-z, 0-9, . _ -).
          </p>
          <input type="hidden" name="email" value="" />
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputCls}
          />
          <input type="hidden" name="username" value="" />
        </div>
      )}

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
