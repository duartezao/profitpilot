"use server";

import { redirect } from "next/navigation";
import { loginUser, registerUser } from "@/lib/auth";
import {
  validateLoginIdentifier,
  validateUsername,
} from "@/lib/username";

export type AuthState = { error?: string };

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const idError = validateLoginIdentifier(identifier);
  if (idError) return { error: idError };
  if (!password) {
    return { error: "Preenche a password." };
  }

  try {
    await loginUser({ identifier, password });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível entrar." };
  }

  redirect("/dashboard");
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const workspaceName = String(formData.get("workspaceName") ?? "").trim();

  if (!name || !username || !email || !password) {
    return { error: "Preenche todos os campos obrigatórios." };
  }
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (password.length < 8) {
    return { error: "A password tem de ter pelo menos 8 caracteres." };
  }

  try {
    await registerUser({ name, username, email, password, workspaceName });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Não foi possível criar a conta.",
    };
  }

  redirect("/dashboard");
}
