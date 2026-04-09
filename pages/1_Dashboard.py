import os
import sys

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.excel_reader import EXCEL_DIR, get_all_projects, parse_full_project
from utils.manager_auth import is_manager_authenticated, show_manager_hint

st.set_page_config(page_title="Dashboard | UBY RECHARGE", page_icon="📊", layout="wide")
st.title("📊 Dashboard — Visão Geral dos Projetos")

st.markdown(
    """
<style>
div[data-testid="metric-container"] {
    background: #1e2130; border-radius: 8px; padding: 12px;
    border-left: 3px solid #00c8ff;
}
</style>
""",
    unsafe_allow_html=True,
)


@st.cache_data(ttl=10)
def load_all():
    projects = []
    for filename in get_all_projects():
        filepath = os.path.join(EXCEL_DIR, filename)
        project = parse_full_project(filepath)
        if project["inputs"]:
            projects.append(project)
    return projects


with st.spinner("Carregando projetos..."):
    projects = load_all()

if not projects:
    st.warning("Nenhum projeto com dados de Inputs encontrado.")
    st.stop()

is_manager = is_manager_authenticated()

st.success(f"{len(projects)} projeto(s) carregado(s)")
st.markdown("---")

total_capex = sum(project["monthly"].get("capex", 0) for project in projects)
total_receita = sum(project["monthly"].get("receita", 0) for project in projects)
total_ebitda = sum(project["monthly"].get("ebitda", 0) for project in projects)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Projetos ativos", len(projects))
c2.metric("CAPEX total", f"R$ {total_capex:,.0f}" if is_manager else show_manager_hint())
c3.metric("Receita mensal total", f"R$ {total_receita:,.0f}")
c4.metric("EBITDA mensal total", f"R$ {total_ebitda:,.0f}")

st.markdown("---")
st.markdown("### Resumo por Projeto")

rows = []
for project in projects:
    monthly = project["monthly"]
    row = {
        "Projeto": project["name"],
        "Receita/mês (R$)": monthly.get("receita", 0),
        "EBITDA/mês (R$)": monthly.get("ebitda", 0),
        "Margem EBITDA": f"{monthly.get('margem_ebitda', 0) * 100:.1f}%",
    }
    if is_manager:
        row["CAPEX (R$)"] = monthly.get("capex", 0)
        row["Payback (meses)"] = round(monthly["payback_meses"], 1) if monthly.get("payback_meses") else "—"
        row["Retorno a.m."] = f"{monthly.get('retorno_am', 0) * 100:.2f}%"
    rows.append(row)

df_summary = pd.DataFrame(rows)
st.dataframe(
    df_summary.style.format(
        {
            column: "R$ {:,.0f}"
            for column in df_summary.columns
            if "(R$)" in column
        }
    ),
    use_container_width=True,
    hide_index=True,
)

st.markdown("---")

names = [project["name"][:30] for project in projects]

col_a, col_b = st.columns(2)
with col_a:
    if is_manager:
        st.markdown("#### CAPEX por Projeto")
        capex_values = [project["monthly"].get("capex", 0) for project in projects]
        fig = px.bar(
            x=names,
            y=capex_values,
            labels={"x": "", "y": "R$"},
            color=capex_values,
            color_continuous_scale="Blues",
        )
    else:
        st.markdown("#### Receita por Projeto")
        revenue_values = [project["monthly"].get("receita", 0) for project in projects]
        fig = px.bar(
            x=names,
            y=revenue_values,
            labels={"x": "", "y": "R$"},
            color=revenue_values,
            color_continuous_scale="Blues",
        )

    fig.update_layout(
        showlegend=False,
        margin=dict(t=10, b=60),
        height=320,
        paper_bgcolor="#0f1117",
        plot_bgcolor="#0f1117",
        font_color="#e0e0e0",
        coloraxis_showscale=False,
    )
    fig.update_xaxes(tickangle=-30)
    st.plotly_chart(fig, use_container_width=True)

with col_b:
    st.markdown("#### EBITDA mensal por Projeto")
    ebitdas = [project["monthly"].get("ebitda", 0) for project in projects]
    colors = ["#00c8ff" if value > 0 else "#ff4b4b" for value in ebitdas]
    fig2 = go.Figure(go.Bar(x=names, y=ebitdas, marker_color=colors))
    fig2.update_layout(
        margin=dict(t=10, b=60),
        height=320,
        paper_bgcolor="#0f1117",
        plot_bgcolor="#0f1117",
        font_color="#e0e0e0",
    )
    fig2.update_xaxes(tickangle=-30)
    st.plotly_chart(fig2, use_container_width=True)

if is_manager:
    st.markdown("#### CAPEX vs Payback (por projeto)")
    scatter_data = [
        {
            "Projeto": project["name"][:25],
            "CAPEX": project["monthly"].get("capex", 0),
            "Payback": project["monthly"].get("payback_meses") or 0,
            "EBITDA": project["monthly"].get("ebitda", 0),
        }
        for project in projects
        if project["monthly"].get("payback_meses")
    ]

    if scatter_data:
        df_scatter = pd.DataFrame(scatter_data)
        fig3 = px.scatter(
            df_scatter,
            x="CAPEX",
            y="Payback",
            size="EBITDA",
            text="Projeto",
            color="EBITDA",
            color_continuous_scale="teal",
            labels={"CAPEX": "CAPEX (R$)", "Payback": "Payback (meses)"},
        )
        fig3.update_traces(textposition="top center")
        fig3.update_layout(
            height=400,
            paper_bgcolor="#0f1117",
            plot_bgcolor="#0f1117",
            font_color="#e0e0e0",
            coloraxis_showscale=False,
        )
        st.plotly_chart(fig3, use_container_width=True)
else:
    st.info("Indicadores de implantação e retorno estão disponíveis apenas na Área do Gestor.")
