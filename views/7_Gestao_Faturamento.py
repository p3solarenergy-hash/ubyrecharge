"""
Gestão — Faturamento: receita, EBITDA e resultado por posto
"""
import plotly.graph_objects as go
import streamlit as st
import pandas as pd

from utils.manager_auth import is_manager_authenticated, show_manager_hint
from utils.p3_styles import inject, page_header, section_title
from utils.project_portfolio import filter_projects, load_portfolio_projects

inject()

page_header(
    "💸 Faturamento",
    "Receita, resultado e estrutura financeira dos postos em operação.",
)


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Gestao")


projects = load_projects()

if not projects:
    st.info(
        "Nenhum projeto em gestão/operação ainda. "
        "Os dados aparecerão aqui após sincronização com o Google Drive.",
        icon="💸",
    )
    st.stop()

is_manager = is_manager_authenticated()

# ── KPIs totais ────────────────────────────────────────────────────────────────
receita_total = sum(p["revenue_monthly"] for p in projects)
ebitda_total  = sum(p["ebitda_monthly"]  for p in projects)
margem_media  = (ebitda_total / receita_total * 100) if receita_total else 0

k1, k2, k3, k4 = st.columns(4)
with k1:
    with st.container(border=True):
        st.metric("Postos em operação", len(projects))
with k2:
    with st.container(border=True):
        st.metric("Receita total/mês", f"R$ {receita_total:,.0f}".replace(",", "."))
with k3:
    with st.container(border=True):
        st.metric("EBITDA total/mês", f"R$ {ebitda_total:,.0f}".replace(",", "."))
with k4:
    with st.container(border=True):
        st.metric("Margem EBITDA", f"{margem_media:.1f}%")

st.markdown("")

# ── Tabela de faturamento ──────────────────────────────────────────────────────
section_title("Resultado por Posto")

rows = []
for p in projects:
    row = {
        "Projeto":        p["name"],
        "Parceiro":       p["partner_name"],
        "Receita/mês":    p["revenue_monthly"],
        "EBITDA/mês":     p["ebitda_monthly"],
    }
    if is_manager:
        row["Result. bruto"]   = p["gross_result_monthly"]
        row["Result. líquido"] = p["net_result_monthly"]
    rows.append(row)

df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

if not is_manager:
    st.info(show_manager_hint("Resultado bruto e líquido ficam protegidos na Área do Gestor."), icon="🔒")

st.markdown("")

# ── Gráfico comparativo ────────────────────────────────────────────────────────
section_title("Receita vs EBITDA por Posto")

fig = go.Figure()
fig.add_trace(go.Bar(
    name="Receita/mês",
    x=df["Projeto"],
    y=df["Receita/mês"],
    marker_color="#3FB66B", marker_line_width=0, opacity=0.92,
))
fig.add_trace(go.Bar(
    name="EBITDA/mês",
    x=df["Projeto"],
    y=df["EBITDA/mês"],
    marker_color="#5BC882", marker_line_width=0, opacity=0.92,
))
if is_manager and "Result. líquido" in df.columns:
    fig.add_trace(go.Bar(
        name="Result. líquido",
        x=df["Projeto"],
        y=df["Result. líquido"],
        marker_color="#FFD66B", marker_line_width=0, opacity=0.92,
    ))

fig.update_layout(
    barmode="group",
    height=360,
    paper_bgcolor="#16221E", plot_bgcolor="#16221E",
    font_color="#E8EFEB",
    legend=dict(orientation="h", yanchor="bottom", y=1.02),
    margin=dict(t=10, b=10),
    xaxis=dict(gridcolor="#2A3530"),
    yaxis=dict(title="R$", gridcolor="#2A3530"),
)
st.plotly_chart(fig, use_container_width=True)

# ── Cards individuais ──────────────────────────────────────────────────────────
st.markdown("")
section_title("Detalhes por Posto")

for i in range(0, len(projects), 2):
    cols = st.columns(2)
    for j, col in enumerate(cols):
        if i + j >= len(projects):
            break
        p = projects[i + j]
        with col:
            with st.container(border=True):
                h1, h2 = st.columns([3, 1])
                with h1:
                    st.markdown(
                        f"<div style='font-size:15px;font-weight:700;color:#E8EFEB'>{p['name']}</div>"
                        f"<div style='font-size:12px;color:#8FA39A'>{p['partner_name']}</div>",
                        unsafe_allow_html=True,
                    )
                m1, m2 = st.columns(2)
                m1.metric("Receita/mês", f"R$ {p['revenue_monthly']:,.0f}".replace(",", "."))
                m2.metric("EBITDA/mês",  f"R$ {p['ebitda_monthly']:,.0f}".replace(",", "."))
                if is_manager:
                    m3, m4 = st.columns(2)
                    m3.metric("Result. bruto",   f"R$ {p['gross_result_monthly']:,.0f}".replace(",", "."))
                    m4.metric("Result. líquido", f"R$ {p['net_result_monthly']:,.0f}".replace(",", "."))

st.markdown("---")
st.caption("P3 Energy • Dados sincronizados via Google Drive.")
