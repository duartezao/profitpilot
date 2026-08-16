/** Constantes e tipos do cofre de acessos — seguros no client e no server. */

export const ACCESS_VAULT_CATEGORIES = [
  "shopify",
  "anuncios",
  "banco",
  "email",
  "fornecedor",
  "dominio",
  "outro",
] as const;

export type AccessVaultCategory = (typeof ACCESS_VAULT_CATEGORIES)[number];

export const ACCESS_VAULT_CATEGORY_LABELS: Record<AccessVaultCategory, string> =
  {
    shopify: "Shopify / loja",
    anuncios: "Anúncios",
    banco: "Banco / pagamentos",
    email: "Email / conta",
    fornecedor: "Fornecedor",
    dominio: "Domínio / hosting",
    outro: "Outro",
  };

export type AccessVaultRow = {
  id: string;
  category: AccessVaultCategory;
  categoryLabel: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  storeId: string | null;
  storeName: string | null;
  updatedAt: string;
};
