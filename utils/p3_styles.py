"""
p3_styles.py — Design System P3 Energy
=======================================
Chame `inject()` no topo de qualquer view para aplicar o visual padrão.

Baseado no dashboard HTML do Analisador de Carga.
"""

import streamlit as st

# ─── PALETA ──────────────────────────────────────────────────────────────────
COLORS = {
    "primary":       "#3FB66B",
    "primary_deep":  "#0F3D2E",
    "accent":        "#5BC882",
    "accent_2":      "#FFD66B",
    "bg":            "#0E1813",
    "card":          "#16221E",
    "text":          "#E8EFEB",
    "muted":         "#8FA39A",
    "border":        "#2A3530",
    "danger":        "#E55545",
    "warn":          "#F2A93D",
    "ok":            "#3FB66B",
}

_CSS = """
<style>
/* ── Variáveis P3 Energy ── */
:root {
  --p3-primary:      #3FB66B;
  --p3-primary-deep: #0F3D2E;
  --p3-accent:       #5BC882;
  --p3-accent-2:     #FFD66B;
  --p3-bg:           #0E1813;
  --p3-card:         #16221E;
  --p3-text:         #E8EFEB;
  --p3-muted:        #8FA39A;
  --p3-border:       #2A3530;
  --p3-danger:       #E55545;
  --p3-warn:         #F2A93D;
  --p3-ok:           #3FB66B;
  --p3-shadow:       0 1px 3px rgba(0,0,0,.4), 0 4px 12px rgba(0,0,0,.5);
}

/* ── Sidebar P3 ── */
[data-testid="stSidebar"] {
  background-color: var(--p3-primary-deep) !important;
  border-right: 1px solid var(--p3-border);
}
[data-testid="stSidebar"] * { color: var(--p3-text) !important; }
[data-testid="stSidebarNavLink"]:hover { background: rgba(63,182,107,.12) !important; }
[data-testid="stSidebarNavLink"][aria-current="page"] {
  background: rgba(63,182,107,.2) !important;
  border-left: 3px solid var(--p3-primary) !important;
}

/* ── Cards / containers ── */
[data-testid="stVerticalBlockBorderWrapper"] {
  background: var(--p3-card) !important;
  border: 1px solid var(--p3-border) !important;
  border-top: 3px solid var(--p3-primary) !important;
  border-radius: 12px !important;
  box-shadow: var(--p3-shadow);
}

/* ── Métricas ── */
[data-testid="stMetricValue"]  { color: var(--p3-primary) !important; font-weight: 700; }
[data-testid="stMetricLabel"]  { color: var(--p3-muted)   !important; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
[data-testid="stMetricDelta"]  { font-size: 12px !important; }

/* ── Botões ── */
[data-testid="stBaseButton-primary"],
[data-testid="stBaseButton-secondary"] {
  border-radius: 8px !important;
  font-weight: 600 !important;
}
[data-testid="stBaseButton-primary"] {
  background: var(--p3-primary) !important;
  border-color: var(--p3-primary) !important;
  color: #fff !important;
}
[data-testid="stBaseButton-primary"]:hover {
  background: var(--p3-accent) !important;
  border-color: var(--p3-accent) !important;
}

/* ── Inputs / selects ── */
[data-testid="stTextInput"] input,
[data-testid="stNumberInput"] input,
[data-testid="stSelectbox"] select,
[data-testid="stTextArea"] textarea {
  background: #1A2622 !important;
  border: 1px solid var(--p3-border) !important;
  border-radius: 8px !important;
  color: var(--p3-text) !important;
}
[data-testid="stTextInput"] input:focus,
[data-testid="stTextArea"] textarea:focus {
  border-color: var(--p3-accent) !important;
  box-shadow: 0 0 0 3px rgba(63,182,107,.15) !important;
}

/* ── Tabelas / dataframes ── */
[data-testid="stDataFrame"] { border-radius: 10px; overflow: hidden; }

/* ── Divisor ── */
hr { border-color: var(--p3-border) !important; }

/* ── Tabs ── */
[data-testid="stTabs"] button {
  color: var(--p3-muted) !important;
  border-radius: 6px 6px 0 0 !important;
}
[data-testid="stTabs"] button[aria-selected="true"] {
  color: var(--p3-primary) !important;
  border-bottom: 2px solid var(--p3-primary) !important;
}

/* ── Badges / status inline ── */
.p3-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .4px;
  text-transform: uppercase;
}
.p3-badge-ok     { background: #0E2A1B; color: #7FE2A0; }
.p3-badge-warn   { background: #2E2310; color: #F2D77F; }
.p3-badge-danger { background: #2E1714; color: #FF8B7C; }
.p3-badge-info   { background: #0D2030; color: #7FCCFF; }
.p3-badge-neutral{ background: #1F2A26; color: #8FA39A; }

/* ── Flag chips ── */
.p3-flag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: #1F2A26;
  color: #8FA39A;
  margin: 2px;
}
.p3-flag-crit { background: #2E1714; color: #FF8B7C; }
.p3-flag-warn { background: #2E2310; color: #F2D77F; }
.p3-flag-ok   { background: #0E2A1B; color: #7FE2A0; }

/* ── Título de seção com barra ── */
.p3-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--p3-primary);
  margin: 16px 0 10px;
}
.p3-section-title::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 20px;
  background: var(--p3-accent);
  border-radius: 3px;
  flex-shrink: 0;
}

/* ── Header de página (bloco verde) ── */
.p3-page-header {
  background: linear-gradient(135deg, #0F3D2E 0%, #1A5C42 100%);
  border-radius: 14px;
  padding: 28px 32px;
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
}
.p3-page-header::after {
  content: "";
  position: absolute;
  right: -60px; top: -60px;
  width: 240px; height: 240px;
  background: radial-gradient(circle, rgba(63,182,107,.3), transparent 70%);
  border-radius: 50%;
}
.p3-page-header h2 {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 6px;
  position: relative; z-index: 1;
}
.p3-page-header p {
  color: rgba(255,255,255,.8);
  font-size: 14px;
  margin: 0;
  position: relative; z-index: 1;
}
</style>
"""


def inject() -> None:
    """Injeta o CSS P3 Energy na página atual. Chamar no início de cada view."""
    st.markdown(_CSS, unsafe_allow_html=True)


def page_header(title: str, subtitle: str = "") -> None:
    """Renderiza o bloco verde de cabeçalho no topo da página."""
    inject()
    st.markdown(
        f'<div class="p3-page-header">'
        f'<h2>{title}</h2>'
        f'{"<p>" + subtitle + "</p>" if subtitle else ""}'
        f'</div>',
        unsafe_allow_html=True,
    )


def section_title(text: str) -> None:
    """Renderiza um título de seção com barra verde à esquerda."""
    st.markdown(f'<div class="p3-section-title">{text}</div>', unsafe_allow_html=True)


def badge(text: str, kind: str = "neutral") -> str:
    """Retorna HTML de um badge colorido. kind: ok | warn | danger | info | neutral"""
    return f'<span class="p3-badge p3-badge-{kind}">{text}</span>'


def flag(text: str, kind: str = "") -> str:
    """Retorna HTML de um flag chip. kind: crit | warn | ok | '' """
    cls = f"p3-flag p3-flag-{kind}" if kind else "p3-flag"
    return f'<span class="{cls}">{text}</span>'
