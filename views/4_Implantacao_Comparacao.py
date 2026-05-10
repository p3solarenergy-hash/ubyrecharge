"""
Comparação de Implantação — viabilidade e potencial econômico entre projetos
"""
import plotly.graph_objects as go
import streamlit as st
import pandas as pd

from utils.manager_auth import is_manager_authenticated
from utils.p3_styles import inject, page_header, section_title
from utils.project_portfolio import filter_projects, load_portfolio_projects

inject()

page_header(
    "📊 Comparação de Implantação",
    "Compare viabilidade, capacidade instalada e potencial econômico entre projetos.",
)


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Implantacao")


projects = load_projects()

if len(projects) < 2:
    st.info(
        "São necessários pelo menos 2 projetos em implantação para comparar. "
        "Adicione mais projetos via Google Drive.",
        icon="📊",
    )
    st.stop()

is_manager = is_manager_authenticated()

# ── Seletor de projetos ────────────────────────────────────────────────────────
options = [p["name"] for p in projects]
selected_names = st.multiselect(
    "Selecione os projetos para comparar",
    options,
    default=options[: min(3, len(options))],
)
selected = [p for p in projects if p["name"] in selected_names]

if len(selected) < 2:
    st.warning("Selecione ao menos 2 projetos para comparar.", icon="⚠️")
    st.stop()

# ── Tabela comparativa ─────────────────────────────────────────────────────────
section_title("Comparativo")

rows = []
for p in selected:
    row = {
        "Projeto":            p["name"],
        "Status":             p["site_status_label"],
        "Carregadores":       p["charger_count"],
        "Receita proj. (R$)": p["revenue_monthly"],
        "EBITDA proj. (R$)":  p["ebitda_monthly"],
    }
    if is_manager:
        row["CAPEX (R$)"]   = p["monthly"].get("capex", 0)
        row["Payback (meses)"] = round(p["monthly"].get("payback_meses") or 0, 1)
    rows.append(row)

df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

st.markdown("")

# ── Gráfico de barras comparativo ──────────────────────────────────────────────
section_title("Receita vs EBITDA vs CAPEX")

fig = go.Figure()
fig.add_trace(go.Bar(
    name="Receita proj.",
    x=df["Projeto"],
    y=df["Receita proj. (R$)"],
    marker_color="#3FB66B", marker_line_width=0, opacity=0.92,
))
fig.add_trace(go.Bar(
    name="EBITDA proj.",
    x=df["Projeto"],
    y=df["EBITDA proj. (R$)"],
    marker_color="#5BC882", marker_line_width=0, opacity=0.92,
))

if is_manager and "CAPEX (R$)" in df.columns:
    fig.add_trace(go.Scatter(
        name="CAPEX",
        x=df["Projeto"],
        y=df["CAPEX (R$)"],
        mode="lines+markers",
        yaxis="y2",
        line=dict(color="#FFD66B", width=2),
        marker=dict(size=8),
    ))

fig.update_layout(
    barmode="group",
    height=380,
    paper_bgcolor="#16221E", plot_bgcolor="#16221E",
    font_color="#E8EFEB",
    legend=dict(orientation="h", yanchor="bottom", y=1.02),
    margin=dict(t=10, b=10),
    xaxis=dict(gridcolor="#2A3530"),
    yaxis=dict(title="R$", gridcolor="#2A3530"),
    yaxis2=dict(
        title="CAPEX (R$)" if is_manager else "",
        overlaying="y", side="right",
        showgrid=False,
        visible=is_manager and "CAPEX (R$)" in df.columns,
    ),
)
st.plotly_chart(fig, use_container_width=True)

# ── Cards de detalhe por projeto ──────────────────────────────────────────────
st.markdown("")
section_title("Detalhes por Projeto")

cols = st.columns(len(selected))
for col, p in zip(cols, selected):
    with col:
        with st.container(border=True):
            st.markdown(
                f"<div style='font-size:14px;font-weight:700;color:#E8EFEB;margin-bottom:6px'>{p['name']}</div>"
                f"<div style='font-size:11px;color:#8FA39A'>{p.get('address','')}</div>",
                unsafe_allow_html=True,
            )
            st.metric("Carregadores", p["charger_count"])
            st.metric("Receita proj./mês", f"R$ {p['revenue_monthly']:,.0f}".replace(",", "."))
            if is_manager:
                st.metric("CAPEX", f"R$ {p['monthly'].get('capex', 0):,.0f}".replace(",", "."))
                payback = p["monthly"].get("payback_meses") or 0
                st.metric("Payback", f"{payback:.1f} meses")

st.markdown("---")
st.caption("P3 Energy • Dados sincronizados via Google Drive.")
