import { z } from "zod";

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function isEmailLike(value: string): boolean {
  return value.includes("@");
}

/** Normaliza identificador de utilizador (sem @ inicial). */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) {
    return "O utilizador tem de ter pelo menos 3 caracteres.";
  }
  if (normalized.length > 30) {
    return "O utilizador pode ter no máximo 30 caracteres.";
  }
  if (!USERNAME_RE.test(normalized)) {
    return "Só letras minúsculas, números, ponto, hífen e underscore; tem de começar com letra ou número.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const parsed = z.string().email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) return "Email inválido.";
  return null;
}

export function validateLoginIdentifier(identifier: string): string | null {
  const raw = identifier.trim();
  if (!raw) return "Preenche o email ou utilizador.";
  if (isEmailLike(raw)) return validateEmail(raw);
  return validateUsername(raw);
}

export function validateInviteIdentifier(identifier: string): string | null {
  const raw = identifier.trim();
  if (!raw) return "Preenche o email ou utilizador.";
  if (isEmailLike(raw)) return validateEmail(raw);
  return validateUsername(raw);
}

export type RegistrationContact = {
  username?: string;
  email?: string;
};

/** Registo: pelo menos um de email ou utilizador. */
export function parseRegistrationContact(
  username: string,
  email: string,
): { ok: true; contact: RegistrationContact } | { ok: false; error: string } {
  const uRaw = username.trim();
  const eRaw = email.trim().toLowerCase();

  if (!uRaw && !eRaw) {
    return { ok: false, error: "Preenche o email ou o utilizador." };
  }

  const contact: RegistrationContact = {};

  if (uRaw) {
    const usernameError = validateUsername(uRaw);
    if (usernameError) return { ok: false, error: usernameError };
    contact.username = normalizeUsername(uRaw);
  }

  if (eRaw) {
    const emailError = validateEmail(eRaw);
    if (emailError) return { ok: false, error: emailError };
    contact.email = eRaw;
  }

  return { ok: true, contact };
}
