/** Política mínima de password (alinhada com app.md). */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return "A password deve ter pelo menos 8 caracteres.";
  }
  if (password.length > 128) {
    return "A password é demasiado longa.";
  }
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return "A password deve incluir letras e números.";
  }
  return null;
}
