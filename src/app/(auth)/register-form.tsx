"use client";

import { useState } from "react";
import { useActionState } from "react";
import { registerAction, type AuthState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" type="text" autoComplete="name" required />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Como queres entrar?</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "username" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setMode("username")}
          >
            Utilizador
          </Button>
          <Button
            type="button"
            variant={mode === "email" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setMode("email")}
          >
            Email
          </Button>
        </div>
      </div>

      {mode === "username" ? (
        <div className="space-y-1.5">
          <Label htmlFor="username">Utilizador</Label>
          <Input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            placeholder="nome.unico"
          />
          <p className="text-xs text-muted-foreground">
            Único na plataforma — 3–30 caracteres (a-z, 0-9, . _ -).
          </p>
          <input type="hidden" name="email" value="" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <input type="hidden" name="username" value="" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="workspaceName">
          Nome do workspace{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="workspaceName"
          name="workspaceName"
          type="text"
          placeholder="As minhas lojas"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "A criar conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
