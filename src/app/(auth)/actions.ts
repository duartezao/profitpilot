"use server";

import { redirect } from "next/navigation";
import { loginUser, registerUser } from "@/lib/auth";

export type AuthState = { error?: string };

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Preenche o email e a password." };
  }

  try {
    await loginUser({ email, password });
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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const workspaceName = String(formData.get("workspaceName") ?? "").trim();

  if (!name || !email || !password) {
    return { error: "Preenche todos os campos obrigatórios." };
  }
  if (password.length < 8) {
    return { error: "A password tem de ter pelo menos 8 caracteres." };
  }

  try {
    await registerUser({ name, email, password, workspaceName });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Não foi possível criar a conta.",
    };
  }

  redirect("/dashboard");
}
