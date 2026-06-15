export const EXPENSE_CATEGORIES = [
  "app",
  "tool",
  "ia",
  "domain",
  "salary",
  "freelancer",
  "chargeback-fee",
  "other",
] as const;

export const EXPENSE_FREQUENCIES = ["one-time", "monthly", "yearly"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  app: "App Shopify",
  tool: "Ferramenta",
  ia: "IA / Criativos",
  domain: "Domínio",
  salary: "Salário",
  freelancer: "Freelancer",
  "chargeback-fee": "Taxa chargeback",
  other: "Outro",
};

const FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  "one-time": "Pontual",
  monthly: "Mensal",
  yearly: "Anual",
};

export function expenseCategoryLabel(c: ExpenseCategory): string {
  return CATEGORY_LABELS[c] ?? c;
}

export function expenseFrequencyLabel(f: ExpenseFrequency): string {
  return FREQUENCY_LABELS[f] ?? f;
}
