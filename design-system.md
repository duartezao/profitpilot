# ProfitPilot — Design System

> **Soft Glass carvão** + cards limpos. SF Pro / Poppins, Shadcn.
> Sem light mode, sem neon, sem azul “AI”.

---

## 1. Tipografia

* **Stack**: `-apple-system` / SF Pro no Apple; **Poppins** (`--font-poppins`) no Windows / resto.
* Tracking: body `-0.011em`, KPIs `-0.03em`.
* Números tabulares (`tnum`). Pesos 400 / 500 / 600.

| Uso | Tamanho | Peso |
|---|---|---|
| Valor KPI | ~32–36px | 600 |
| H1 | 28–32px | 600 |
| Secção | 17px | 600 |
| Label | 13px | 500 |
| Delta | 13px | 600 |

---

## 2. Direcção — Soft Glass carvão

* Fundo `#1C1C1C` + vinhetas cinza suaves (como antes).
* Cards glass carvão sem borda pesada; radius ~20px.
* Accent **prata** `#ECECEC` (não system blue).
* KPIs com valor grande, delta tipográfico, sparkline.
* Dark-only.

---

## 3. Cores

| Token | Valor | Uso |
|---|---|---|
| `background` | `#1C1C1C` | Fundo carvão |
| `surface` / `sidebar` | cinza ~82–90% | Glass |
| `popover` | `#2A2A2A` | Menus |
| `border` | branco ~12% | Separators |
| `foreground` | `#F5F5F5` | Texto |
| `muted-foreground` | `#A3A3A3` | Labels |
| `accent` | `#ECECEC` | CTAs |
| `positive` / `negative` | `#4ADE80` / `#FB7185` | Estados |
| `chart-positive` | `#86EFAC` | Lucro no gráfico |

---

## 4. Componentes

### KPI
* Sem chrome (sem pill, sem ring).
* Delta verde/vermelho tipográfico.
* Sparkline na cor do tone.

### Listas / tabelas
* Separators hairline; sem outline no card pai.

### Botões
* Primário systemBlue; secondary muted fill.

---

## 5. Regras

1. Parece **Apple Stocks / Wallet**, não dashboard SaaS genérico.
2. Contraste por superfície, não por borda.
3. Sem grain, riscas, glow.
4. Mobile-first.
