import os
import sys

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.calculations import calc_annual_projection
from utils.excel_reader import EXCEL_DIR, get_all_projects, parse_full_project
from utils.manager_auth import is_manager_authenticated

st.set_page_config(page_title="Comparação | UBY RECHARGE", page_icon="🔄", layout="wide")
st.title("🔄 Comparação de Projetos")

files = get_all_projects()
selected = st.multiselect(
    "Selecione os projetos para comparar (mín. 2):",
    files,
    default=files[:2] if len(files) >= 2 else files,
    format_func=lambda name: name.replace(".xlsx", ""),
)

if len(selected) < 2:
    st.info("Selecione ao menos 2 projetos para comparar.")
    st.stop()

is_manager = is_manager_authenticated()


@st.cache_data(ttl=10)
def load_project(path):
    return parse_full_project(path)


projects = []
for filename in selected:
    filepath = os.path.join(EXCEL_DIR, filename)
    project = load_project(filepath)
    if project["inputs"]:
        projects.append(project)

if not projects:
    st.warning("Nenhum projeto com inputs compatíveis.")
    st.stop()

names = [project["name"][:30] for project in projects]
colors = px.colors.qualitative.Plotly[: len(projects)]

st.markdown("### KPIs por Projeto")
cols = st.columns(len(projects))
for project, col in zip(projects, cols):
    monthly = project["monthly"]
    col.markdown(f"**{project['name'][:25]}**")
    col.metric("Receita/mês", f"R$ {monthly['receita']:,.0f}")
    col.metric("EBITDA/mês", f"R$ {monthly['ebitda']:,.0f}")
    col.metric("Margem EBITDA", f"{monthly['margem_ebitda'] * 100:.1f}%")
    if is_manager:
        col.metric("CAPEX", f"R$ {monthly['capex']:,.0f}")
        payback = monthly.get("payback_meses")
        col.metric("Payback", f"{payback:.1f} m" if payback else "—")

st.markdown("---")
st.markdown("### Tabela Comparativa")

kpi_labels = {
    "Receita/mês (R$)": lambda monthly: monthly.get("receita", 0),
    "EBITDA/mês (R$)": lambda monthly: monthly.get("ebitda", 0),
    "Margem EBITDA (%)": lambda monthly: round(monthly.get("margem_ebitda", 0) * 100, 1),
}
if is_manager:
    kpi_labels.update(
        {
            "CAPEX (R$)": lambda monthly: monthly.get("capex", 0),
            "Custo Energia/mês (R$)": lambda monthly: monthly.get("custo_energia", 0),
            "Custos Variáveis/mês (R$)": lambda monthly: monthly.get("custo_variavel", 0),
            "Custos Fixos/mês (R$)": lambda monthly: monthly.get("custos_fixos", 0),
            "Payback (meses)": lambda monthly: round(monthly.get("payback_meses") or 0, 1),
            "Retorno a.m. (%)": lambda monthly: round(monthly.get("retorno_am", 0) * 100, 2),
        }
    )

rows = []
for label, fn in kpi_labels.items():
    row = {"KPI": label}
    for project in projects:
        row[project["name"][:20]] = fn(project["monthly"])
    rows.append(row)

st.dataframe(pd.DataFrame(rows).set_index("KPI"), use_container_width=True)

if not is_manager:
    st.info("CAPEX, custos e indicadores de retorno aparecem apenas na Área do Gestor.")

st.markdown("---")

col1, col2 = st.columns(2)
with col1:
    st.markdown("#### Receita vs EBITDA/mês")
    fig = go.Figure()
    fig.add_trace(go.Bar(name="Receita", x=names, y=[p["monthly"]["receita"] for p in projects], marker_color="#00e676"))
    fig.add_trace(go.Bar(name="EBITDA", x=names, y=[p["monthly"]["ebitda"] for p in projects], marker_color="#00c8ff"))
    fig.update_layout(
        barmode="group",
        height=320,
        paper_bgcolor="#0f1117",
        plot_bgcolor="#0f1117",
        font_color="#e0e0e0",
        legend=dict(orientation="h", y=-0.15),
        margin=dict(t=10, b=60),
    )
    st.plotly_chart(fig, use_container_width=True)

with col2:
    if is_manager:
        st.markdown("#### Payback (meses)")
        values = [p["monthly"].get("payback_meses") or 0 for p in projects]
        fig2 = go.Figure(
            go.Bar(x=names, y=values, marker_color=colors, text=[f"{value:.1f}m" for value in values], textposition="outside")
        )
        fig2.update_layout(
            height=320,
            paper_bgcolor="#0f1117",
            plot_bgcolor="#0f1117",
            font_color="#e0e0e0",
            margin=dict(t=10, b=60),
            yaxis_title="meses",
        )
        st.plotly_chart(fig2, use_container_width=True)
    else:
        st.markdown("#### Margem EBITDA (%)")
        margins = [p["monthly"].get("margem_ebitda", 0) * 100 for p in projects]
        fig2 = go.Figure(go.Bar(x=names, y=margins, marker_color="#ffa500"))
        fig2.update_layout(
            height=320,
            paper_bgcolor="#0f1117",
            plot_bgcolor="#0f1117",
            font_color="#e0e0e0",
            margin=dict(t=10, b=60),
            yaxis_title="%",
        )
        st.plotly_chart(fig2, use_container_width=True)

st.markdown("### Projeção Anual Comparada")
years = st.slider("Horizonte (anos)", 1, 15, 10)

fig3 = go.Figure()
for index, project in enumerate(projects):
    projection = pd.DataFrame(calc_annual_projection(project.get("schema", project["inputs"]), anos=years))
    fig3.add_trace(
        go.Scatter(
            x=projection["Ano"],
            y=projection["EBITDA"],
            mode="lines+markers",
            name=project["name"][:20],
            line=dict(color=colors[index], width=2),
        )
    )

fig3.update_layout(
    title="EBITDA Anual por Projeto",
    height=380,
    paper_bgcolor="#0f1117",
    plot_bgcolor="#0f1117",
    font_color="#e0e0e0",
    yaxis_title="R$",
    legend=dict(orientation="h", y=-0.15),
    margin=dict(t=30, b=60),
)
st.plotly_chart(fig3, use_container_width=True)
