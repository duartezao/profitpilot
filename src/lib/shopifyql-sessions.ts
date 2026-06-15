/**
 * ShopifyQL para métricas de sessões (sem dependências server-only — testável).
 * Ordem obrigatória: FROM → SHOW → WHERE → SINCE/UNTIL → TIMESERIES → ORDER BY → LIMIT.
 * @see https://shopify.dev/docs/api/shopifyql
 */
export function buildDailySessionsQuery(
  since: string,
  until: string,
  countryCode: string | null,
): string {
  const parts = [
    "FROM sessions",
    "SHOW sessions, sessions_with_cart_additions,",
    "sessions_that_reached_checkout, sessions_that_completed_checkout",
  ];

  if (countryCode) {
    parts.push(
      `WHERE session_country_code = '${countryCode.replace(/'/g, "''")}'`,
    );
  }

  parts.push(
    `SINCE ${since} UNTIL ${until}`,
    "TIMESERIES day",
    "ORDER BY day ASC",
    "LIMIT 1000",
  );

  return parts.join(" ");
}
