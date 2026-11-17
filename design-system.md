# ProfitPilot — Design System

> **Soft Glass B + estética Apple (dark-only)**. Tipografia SF/Inter, Shadcn.
> Sem light mode, sem cyan neon, sem riscas, sem blobs “AI”.

---

## 1. Tipografia (cara Apple)

* **Stack**: `-apple-system` / `SF Pro Text` no Apple; **Inter** (`--font-inter`) no resto.
* Inter é o fallback web mais próximo de SF Pro (Windows/Android).
* **Números**: tabulares (`tnum`).
* Tracking negativo estilo SF: body `-0.011em`, títulos/KPIs `-0.022em`…`-0.025em`.
* Antialiasing + `optimizeLegibility`.
* Pesos: 400 / 500 / 600 (evitar 700 em UI).

| Uso | Tamanho | Peso | Tracking |
|---|---|---|---|
| Valor KPI | ~28–32px | 600 | `-0.025em` |
| H1 | 28–32px | 600 | `-0.022em` |
| H2 | 17–18px | 600 | `-0.015em` |
| Corpo | 14–15px | 400 | `-0.011em` |
| Label KPI | 13px | 500 | `-0.01em` |

---

## 2. Direcção visual — Apple Dark Mode

* Hierarquia HIG: canvas `#000` → grouped `#1C1C1E` → elevated `#2C2C2E`.
* Materiais com blur (`40–48px`) + saturate — vibrancy.
* Bordas hairline (`0.5px`) = `separator`.
* Accent **systemBlue** `#0A84FF`.
* Semânticas exactas: green `#30D158`, red `#FF453A`, yellow `#FFD60A`.
* KPIs clean; gráfico dual; topbar fixa; dark-only.

---

## 3. Cores (Apple Dark Mode)

| Token | Valor | Apple |
|---|---|---|
| `background` | `#000000` | systemBackground |
| `surface` | `#1C1C1E` | secondarySystemGroupedBackground |
| `sidebar` | `#1C1C1E` ~94% | nav material |
| `popover` | `#2C2C2E` | tertiarySystemGroupedBackground |
| `muted` | `rgba(120,120,128,0.24)` | tertiaryFill |
| `border` | `rgba(84,84,88,0.65)` | separator |
| `foreground` | `#FFFFFF` | label |
| `muted-foreground` | `rgba(235,235,245,0.6)` | secondaryLabel |
| `accent` | `#0A84FF` | systemBlue |
| `positive` | `#30D158` | systemGreen |
| `negative` | `#FF453A` | systemRed |
| `warning` | `#FFD60A` | systemYellow |

---

## 4. Forma

* Radius ~12px (`0.75rem`) em cards; botões ~10px.
* Gap cards `gap-3` / `gap-4`.
* `.glass` / `.glass-nav` em `globals.css`.

---

## 5. Componentes

### KPI
* Cards iguais; label 13px muted; valor grande tabular.

### Gráfico
* Área Faturação prata/cinza; linha Lucro verde sistema.

### Nav
* Activo: `bg-muted` (pill iOS); bottom nav activo em accent blue.

### Botões
* Primário: System Blue filled.
* Secondary/outline: muted / hairline.

---

## 6. Regras de ouro

1. Parece **Apple Finance / Settings dark** — limpo, não sci-fi.
2. Sem undertone azul no fundo (só no accent interactivo).
3. Sem grain, sem riscas, sem neon.
4. Números tabulares; Lucide monocromático.
5. Mobile-first (375 / 768 / 1280+).
