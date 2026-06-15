# ProfitPilot — Design System

> Fonte única e canónica da identidade visual. A app tem de seguir isto a 100%, em todos os ecrãs (ver mockups em `assets/`). Sem gradientes, sem neon, sem sombras pesadas, sem emojis.

---

## 1. Tipografia

* **Fonte**: `Inter` (fallback: `Geist`, depois system-ui, sans-serif).
* **Números**: sempre **tabulares** → `font-variant-numeric: tabular-nums;` (valores alinhados em KPIs e tabelas).
* **Pesos**: Regular 400 (corpo), Medium 500 (labels), Semibold 600 (títulos/valores), Bold 700 (raro, só destaques).

| Uso | Tamanho | Peso | Line-height |
|---|---|---|---|
| Display / valor KPI grande | 30px (`text-3xl`) | 600 | 1.2 |
| Título de página (H1) | 24px (`text-2xl`) | 600 | 1.3 |
| Secção (H2) | 18px (`text-lg`) | 600 | 1.4 |
| Corpo | 14px (`text-sm`) | 400 | 1.5 |
| Label / rótulo KPI | 13px | 500 | 1.4 |
| Caption / meta | 12px (`text-xs`) | 400 | 1.4 |

---

## 2. Cores

### Light mode

| Token | Hex | Uso |
|---|---|---|
| `background` | `#F8FAFC` | Fundo da área principal |
| `sidebar` | `#FFFFFF` | Sidebar (branco sobre fundo cinza) |
| `surface` / card | `#FFFFFF` | Cartões (distinguidos por borda) |
| `muted` | `#F1F5F9` | Fundos subtis, hover de linha, item ativo |
| `border` | `#E2E8F0` | Bordas de cartões, tabelas, inputs |
| `foreground` | `#111827` | Texto principal |
| `muted-foreground` | `#64748B` | Texto secundário, labels |

### Dark mode

| Token | Hex | Uso |
|---|---|---|
| `background` | `#1C242C` | Fundo da área principal |
| `sidebar` | `#181F28` | Sidebar (ligeiramente mais escura) |
| `surface` / card | `#22282E` | Cartões |
| `muted` | `#283448` | Fundos subtis, item ativo (tom azulado) |
| `border` | `#2E3844` | Bordas |
| `foreground` | `#E8EDF2` | Texto principal |
| `muted-foreground` | `#8898A8` | Texto secundário |

### Accent e semânticas (iguais em light/dark)

| Token | Hex | Uso |
|---|---|---|
| `accent` (azul) | `#2563EB` | Item ativo, links, seleção, foco |
| `accent-foreground` | `#FFFFFF` | Texto sobre accent |
| `positive` (verde) | `#16A34A` | Lucro, crescimento, status "Scale" |
| `negative` (vermelho) | `#DC2626` | Prejuízo, queda, status "Kill" |
| `warning` (âmbar) | `#D97706` | Avisos, status intermédio |
| `chart-positive` | `#609060` | Barra final do waterfall (lucro) |
| `chart-neutral` | `#8898A8` | Barras neutras do waterfall |

> Verde/vermelho/âmbar **só** em valores e estados — nunca como decoração ou fundo grande.

---

## 3. Espaçamento, cantos e bordas

* **Grelha base**: 4px. Escala: 4, 8, 12, 16, 24, 32, 48.
* **Padding de cartão**: 16–24px (`p-4` a `p-6`).
* **Gap entre cartões/grelha**: 16px (`gap-4`).
* **Cantos**: `rounded-lg` (8px) em cartões, botões e inputs; `rounded-full` em pills/avatars.
* **Bordas**: 1px sólido `border`. **Preferir borda a sombra.**
* **Sombras**: nenhuma por defeito; no máximo `shadow-sm` muito subtil.

---

## 4. Ícones

* **Biblioteca**: `lucide-react` (única biblioteca, não misturar).
* **Estilo**: traço fino, **monocromático** (herda a cor do texto), tamanho 16–20px (`w-4`/`w-5`).
* **Sem** ícones coloridos, sem emojis.

---

## 5. Componentes

### Cartão de KPI
* Rótulo pequeno (`muted-foreground`, 13px) em cima.
* Valor grande (`text-3xl`, 600, tabular-nums).
* Variação: `+18,6%` verde / `-4,8%` vermelho, com seta.
* Sparkline fina (cor `accent` ou neutra).
* Cartão: fundo `surface`, borda `border`, `rounded-lg`, `p-5`.

### Tabela
* Cabeçalho: 12–13px, `muted-foreground`, 500.
* Linhas separadas por borda subtil; hover `muted`.
* Números alinhados à **direita**, tabulares.
* Status em **pill/badge** (ver abaixo).

### Badge / Pill de status
* `rounded-full`, padding `px-2.5 py-0.5`, 12px, 500.
* Scale: texto/fundo verde subtil. Kill: vermelho subtil. Manter: cinza. Aviso: âmbar.

### Botões
* **Primário**: fundo `accent`, texto branco, `rounded-lg`, `h-9`, 14px/500.
* **Secundário**: fundo `surface`, borda `border`, texto `foreground`.
* **Ghost**: sem fundo, texto `foreground`, hover `muted`.

### Navegação
* **Desktop**: sidebar fixa à esquerda, ~240px, fundo `sidebar`, item ativo com fundo `accent/10` (light) ou `muted` (dark) + texto `accent`.
* **Mobile**: barra inferior com 4 itens (ícone + label 11–12px), item ativo a `accent`.
* Top bar: seletor de loja, seletor de período, avatar.

---

## 6. Gráficos (Recharts / Tremor)

* Linhas/áreas: cor `accent` (`#2563EB`); área com opacidade baixa, sem gradiente forte.
* Waterfall: barras neutras a `chart-neutral` e barra final de lucro a `chart-positive`; passos negativos com tom neutro mais claro.
* Eixos e grelha: cinza muito subtil; sem fundos coloridos.
* Sparklines: 1px, sem pontos, sem eixos.

---

## 7. Stack de implementação

* **Tailwind CSS** + **Shadcn/UI** com tema baseado nestes tokens (CSS variables).
* Definir as variáveis em `globals.css` (`:root` e `.dark`) e mapear no `tailwind.config`.

### CSS variables (exemplo `globals.css`)

```css
:root {
  --background: #F8FAFC;
  --sidebar: #FFFFFF;
  --surface: #FFFFFF;
  --muted: #F1F5F9;
  --border: #E2E8F0;
  --foreground: #111827;
  --muted-foreground: #64748B;
  --accent: #2563EB;
  --positive: #16A34A;
  --negative: #DC2626;
  --warning: #D97706;
  --chart-positive: #609060;
  --chart-neutral: #8898A8;
  --radius: 0.5rem; /* 8px */
}

.dark {
  --background: #1C242C;
  --sidebar: #181F28;
  --surface: #22282E;
  --muted: #283448;
  --border: #2E3844;
  --foreground: #E8EDF2;
  --muted-foreground: #8898A8;
  --chart-positive: #609060;
  --chart-neutral: #8898A8;
}
```

### Tailwind (exemplo `tailwind.config`)

```js
theme: {
  extend: {
    colors: {
      background: 'var(--background)',
      surface: 'var(--surface)',
      muted: 'var(--muted)',
      border: 'var(--border)',
      foreground: 'var(--foreground)',
      'muted-foreground': 'var(--muted-foreground)',
      accent: 'var(--accent)',
      positive: 'var(--positive)',
      negative: 'var(--negative)',
      warning: 'var(--warning)',
    },
    borderRadius: { lg: 'var(--radius)' },
    fontFamily: { sans: ['Inter', 'Geist', 'system-ui', 'sans-serif'] },
  },
}
```

---

## 8. Regras de ouro

1. Seguir os **mockups em `assets/`** como referência canónica.
2. **Borda, não sombra.** Superfícies planas.
3. Verde/vermelho/âmbar **só** em valores e estados.
4. Números sempre **tabulares**.
5. Ícones Lucide, finos, monocromáticos.
6. **Sem** gradientes, neon, emojis, ilustrações cartoon.
7. Mobile-first e responsivo a 100% (telemóvel, tablet, desktop).
