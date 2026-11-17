"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [state, action, pending] = useActionState<AuthState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="identifier">Email ou utilizador</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          required
          placeholder="tu@email.com ou nome.utilizador"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "A entrar…" : "Entrar"}
      </Button>
    </form>
  );
}
