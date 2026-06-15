import "server-only";

export const SHOPIFY_API_VERSION =
  process.env.SHOPIFY_API_VERSION || "2025-10";

/** Normaliza o domínio (remove protocolo e barra final). */
export function normalizeShopDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export type ShopInfo = {
  name: string;
  myshopifyDomain: string;
  currencyCode: string;
  ianaTimezone: string;
};

export type AccessToken = {
  accessToken: string;
  scope: string;
  /** Segundos até expirar (tipicamente ~86400 = 24h). */
  expiresIn: number;
};

/**
 * Obtém um access token via client credentials grant (RFC 6749 §4.4).
 * Funciona para apps da própria organização instaladas em lojas tuas.
 * O token é de curta duração (~24h) e deve ser pedido de novo quando expira.
 */
export async function getClientCredentialsToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string,
): Promise<AccessToken> {
  const domain = normalizeShopDomain(shopDomain);
  const url = `https://${domain}/admin/oauth/access_token`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Não foi possível contactar a loja. Confirma o domínio (ex.: aminhaloja.myshopify.com).",
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    scope?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_client") {
      throw new Error("Client ID ou Chave secreta inválidos.");
    }
    const detail = `${json.error ?? ""} ${json.error_description ?? ""}`;
    if (detail.includes("shop_not_permitted")) {
      throw new Error(
        "A app e a loja têm de pertencer à mesma organização (client credentials só funciona em lojas tuas).",
      );
    }
    throw new Error(`Não foi possível obter o token (${res.status}).`);
  }

  return {
    accessToken: json.access_token,
    scope: json.scope ?? "",
    expiresIn: json.expires_in ?? 0,
  };
}

/**
 * Testa a ligação a uma loja Shopify (app API-only) usando o Admin GraphQL API.
 * Lança erro com mensagem clara se as credenciais/scopes estiverem errados.
 */
export async function testShopifyConnection(
  shopDomain: string,
  accessToken: string,
): Promise<ShopInfo> {
  const domain = normalizeShopDomain(shopDomain);
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const query = `{ shop { name myshopifyDomain currencyCode ianaTimezone } }`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Não foi possível contactar a loja. Confirma o domínio (ex.: aminhaloja.myshopify.com).",
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Token inválido ou sem permissões. Confirma o Access token e os scopes.",
    );
  }
  if (!res.ok) {
    throw new Error(`A Shopify respondeu com erro (${res.status}).`);
  }

  const json = (await res.json()) as {
    data?: { shop?: ShopInfo };
    errors?: unknown;
  };

  if (json.errors || !json.data?.shop) {
    throw new Error(
      "Resposta inesperada da Shopify. Verifica o domínio e as permissões.",
    );
  }

  return json.data.shop;
}
