# ProfitPilot — Design System

> Fonte única e canónica da identidade visual. **Soft Glass B (Combo 3)** — dark-only, Poppins, Shadcn.
> Sem light mode, sem cyan neon, sem blobs azuis “AI”, sem emojis.

---

## 1. Tipografia

* **Fonte**: `Poppins` (fallback: system-ui, sans-serif). Carregar via `next/font/google` (`--font-poppins`).
* **Números**: sempre **tabulares** → `font-variant-numeric: tabular-nums;`.
* **Pesos**: Regular 400, Medium 500, Semibold 600 (títulos/valores).

| Uso | Tamanho | Peso | Line-height |
|---|---|---|---|
| Valor KPI | 24–30px (`text-2xl`/`text-3xl`) | 600 | 1.2 |
| Título de página (H1) | 24px (`text-2xl`) | 600 | 1.3 |
| Secção (H2) | 18px (`text-lg`) | 600 | 1.4 |
| Corpo | 14px (`text-sm`) | 400 | 1.5 |
| Label KPI | 13px | 500 | 1.4 |
| Caption / meta | 12px (`text-xs`) | 400 | 1.4 |

---

## 2. Direcção visual — Soft Glass B

* Superfícies **translúcidas** com `backdrop-filter: blur` (`.glass` / `.glass-nav`).
* Bordas prateadas finas em alpha; highlight interior 1px; sombra suave.
* Fundo: carvão neutro médio `#1C1C1C` (sem undertone azul) + vinhetas cinza suaves — **sem** grain, **sem** riscas.
* Accent **prata neutra** (`#E8E8E8`) — CTAs e foco, não cyan/azul.
* Nav activa: fill `foreground/10` (pill suave), não invertida sólida.
* KPIs **clean iguais** (Combo 3) — sem hero/barra accent.
* Gráfico **dual**: área Faturação (prata) + linha Lucro (mint).
* Shell: topbar **fixixa**; só o `main` faz scroll.
* **Dark-only** (`forcedTheme="dark"`, sem toggle de tema).

---

## 3. Cores (dark-only)

| Token | Valor | Uso |
|---|---|---|
| `background` | `#1C1C1C` | Fundo carvão médio |
| `sidebar` / `surface` | cinza neutro alpha ~78–90% | Glass |
| `border` | branco alpha ~12% | Contornos |
| `foreground` | `#F5F5F5` | Texto |
| `muted-foreground` | `#A3A3A3` | Labels |
| `accent` | `#ECECEC` | CTAs / foco |
| `chart-positive` | `#86EFAC` | Linha de lucro no gráfico |

### Semânticas

| Token | Uso |
|---|---|
| `positive` | Lucro / Scale |
| `negative` | Prejuízo / Kill |
| `warning` | Avisos |
| `chart-neutral` | Eixos / neutro |

> Verde/vermelho/âmbar **só** em valores e estados.

---

## 4. Espaçamento e forma

* Grelha 4px; gap cards `gap-3` / `gap-4`.
* Cantos: `rounded-2xl` em cards glass; `rounded-xl` em botões.
* Classes canónicas: `.glass`, `.glass-nav` em [src/app/globals.css](src/app/globals.css).

---

## 5. Componentes

### KPI (Combo 3 — clean)
* Quatro cards iguais em grelha `2 → 4`.
* Label 13px muted; valor `text-2xl`/`text-3xl` tabular.
* Sem emphasis/hero, sem barra superior.

### Gráfico (Combo 3 — dual)
* Painel glass; área Faturação em prata suave; linha Lucro mint sólida.
* Tooltip glass.

### Navegação
* Sidebar / topbar / bottom: `.glass-nav`.
* Activo: `bg-foreground/10 text-foreground`.

### Botões (Shadcn)
* Primário: `bg-accent` (prata) + texto escuro.
* Outline/secondary: glass.

### Stack
* Tailwind 4 + **Shadcn/UI** em `src/components/ui`, tokens CSS variables.

---

## 6. Regras de ouro

1. **Soft glass + prata** — não cyan neon, não blobs azuis.
2. Dark-only; sem light mode.
3. KPIs clean iguais; gráfico dual Faturação/Lucro.
4. Sem neon agressivo, sem emojis.
5. Números tabulares; ícones Lucide monocromáticos.
6. Mobile-first (375 / 768 / 1280+).
