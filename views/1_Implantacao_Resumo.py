"""
Resumo de Implantação — pipeline consolidado de projetos
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from utils.manager_auth import is_manager_authenticated, show_manager_hint
from utils.p3_styles import inject, page_header, section_title, badge
from utils.project_portfolio import filter_projects, load_portfolio_projects

inject()

page_header(
    "📍 Resumo de Implantação",
    "Visão consolidada dos projetos entre prospecção, estudo, contrato e obra.",
)


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Implantacao")


projects = load_projects()

if not projects:
    st.info(
        "Nenhum projeto na fase de implantação cadastrado ainda. "
        "Os dados aparecerão aqui automaticamente após sincronização com o Google Drive.",
        icon="📍",
    )
    st.stop()

is_manager = is_manager_authenticated()

# ── KPIs ──────────────────────────────────────────────────────────────────────
count_em_estudo = sum(1 for p in projects if p["site_status"] == "em_estudo")
count_em_obra   = sum(1 for p in projects if p["site_status"] == "em_obra")
count_contrato  = sum(1 for p in projects if p["site_status"] == "contrato_assinado")
total_capex     = sum(p["monthly"].get("capex", 0) for p in projects)

k1, k2, k3, k4 = st.columns(4)
with k1:
    with st.container(border=True):
        st.metric("Total em implantação", len(projects))
with k2:
    with st.container(border=True):
        st.metric("Em estudo", count_em_estudo)
with k3:
    with st.container(border=True):
        st.metric("Em obra", count_em_obra)
with k4:
    with st.container(border=True):
        if is_manager:
            st.metric("CAPEX total", f"R$ {total_capex:,.0f}".replace(",", "."))
        else:
            st.metric("CAPEX total", show_manager_hint())

st.markdown("")

# ── Tabela pipeline ────────────────────────────────────────────────────────────
section_title("Pipeline de Implantação")

rows = []
for p in projects:
    row = {
        "Projeto":           p["name"],
        "Status":            p["site_status_label"],
        "Endereço":          p["address"],
        "Parceiro":          p["partner_name"],
        "Carregadores":      p["charger_count"],
        "Receita proj. (R$)": p["revenue_monthly"],
        "EBITDA proj. (R$)":  p["ebitda_monthly"],
    }
    if is_manager:
        row["CAPEX (R$)"] = p["monthly"].get("capex", 0)
    rows.append(row)

df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

st.markdown("")

# ── Gráficos ──────────────────────────────────────────────────────────────────
col_left, col_right = st.columns(2)

with col_left:
    section_title("Status dos Projetos")
    status_counts = df["Status"].value_counts().reset_index()
    status_counts.columns = ["Status", "Projetos"]
    fig_status = go.Figure(go.Bar(
        x=status_counts["Status"],
        y=status_counts["Projetos"],
        marker_color="#3FB66B",
        marker_line_width=0,
    ))
    fig_status.update_layout(
        height=300,
        paper_bgcolor="#16221E", plot_bgcolor="#16221E",
        font_color="#E8EFEB",
        showlegend=False,
        margin=dict(t=10, b=10),
        xaxis=dict(gridcolor="#2A3530"),
        yaxis=dict(gridcolor="#2A3530"),
    )
    st.plotly_chart(fig_status, use_container_width=True)

with col_right:
    section_title("Receita vs EBITDA Projetado")
    fig_fin = go.Figure()
    fig_fin.add_trace(go.Bar(
        name="Receita proj.",
        x=df["Projeto"],
        y=df["Receita proj. (R$)"],
        marker_color="#3FB66B", marker_line_width=0, opacity=0.9,
    ))
    fig_fin.add_trace(go.Bar(
        name="EBITDA proj.",
        x=df["Projeto"],
        y=df["EBITDA proj. (R$)"],
        marker_color="#5BC882", marker_line_width=0, opacity=0.9,
    ))
    fig_fin.update_layout(
        barmode="group", height=300,
        paper_bgcolor="#16221E", plot_bgcolor="#16221E",
        font_color="#E8EFEB",
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        margin=dict(t=10, b=10),
        xaxis=dict(gridcolor="#2A3530"),
        yaxis=dict(gridcolor="#2A3530", title="R$"),
    )
    st.plotly_chart(fig_fin, use_container_width=True)

st.markdown("---")
st.caption("P3 Energy • Dados sincronizados via Google Drive.")
