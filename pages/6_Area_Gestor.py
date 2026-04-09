import os
import sys

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.excel_reader import EXCEL_DIR, get_all_projects, parse_full_project
from utils.manager_auth import is_manager_authenticated, logout_manager, render_manager_login

st.set_page_config(page_title="Área do Gestor | UBY RECHARGE", page_icon="🔒", layout="wide")
st.title("🔒 Área do Gestor")
st.caption("Custos de implantação, CAPEX, payback e pontos financeiros estratégicos.")

if not render_manager_login():
    st.stop()

top_left, top_right = st.columns([4, 1])
with top_right:
    if st.button("Sair da área do gestor"):
        logout_manager()
        st.rerun()

files = get_all_projects()
if not files:
    st.warning("Nenhuma planilha encontrada.")
    st.stop()


@st.cache_data(ttl=10)
def load_projects():
    projects = []
    for filename in files:
        filepath = os.path.join(EXCEL_DIR, filename)
        project = parse_full_project(filepath)
        if project["inputs"]:
            projects.append(project)
    return projects


projects = load_projects()
if not projects:
    st.warning("Nenhum projeto com dados financeiros compatíveis.")
    st.stop()

total_capex = sum(project["monthly"].get("capex", 0) for project in projects)
total_ebitda = sum(project["monthly"].get("ebitda", 0) for project in projects)
paybacks = [
    project["monthly"].get("payback_meses")
    for project in projects
    if project["monthly"].get("payback_meses")
]
avg_payback = sum(paybacks) / len(paybacks) if paybacks else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Projetos monitorados", len(projects))
c2.metric("CAPEX total", f"R$ {total_capex:,.0f}")
c3.metric("EBITDA mensal total", f"R$ {total_ebitda:,.0f}")
c4.metric("Payback médio", f"{avg_payback:.1f} meses" if avg_payback else "—")

st.markdown("---")

rows = []
for project in projects:
    monthly = project["monthly"]
    rows.append(
        {
            "Projeto": project["name"],
            "CAPEX (R$)": monthly.get("capex", 0),
            "Receita/mês (R$)": monthly.get("receita", 0),
            "Custo Energia/mês (R$)": monthly.get("custo_energia", 0),
            "Custos Variáveis/mês (R$)": monthly.get("custo_variavel", 0),
            "Custos Fixos/mês (R$)": monthly.get("custos_fixos", 0),
            "EBITDA/mês (R$)": monthly.get("ebitda", 0),
            "Payback (meses)": round(monthly["payback_meses"], 1) if monthly.get("payback_meses") else "—",
            "Retorno a.m. (%)": round(monthly.get("retorno_am", 0) * 100, 2),
        }
    )

st.markdown("### Resumo financeiro")
df_summary = pd.DataFrame(rows)
st.dataframe(df_summary, use_container_width=True, hide_index=True)

st.markdown("---")

selected = st.selectbox(
    "Projeto para detalhar",
    projects,
    format_func=lambda project: project["name"],
)
monthly = selected["monthly"]

left, right = st.columns([2, 1])
with left:
    st.markdown("### Estrutura de custos")
    fig = go.Figure(
        go.Bar(
            x=["Receita", "Energia", "Custos Variáveis", "Custos Fixos", "EBITDA"],
            y=[
                monthly.get("receita", 0),
                -monthly.get("custo_energia", 0),
                -monthly.get("custo_variavel", 0),
                -monthly.get("custos_fixos", 0),
                monthly.get("ebitda", 0),
            ],
            marker_color=["#00e676", "#ff6b6b", "#ffa500", "#888888", "#00c8ff"],
        )
    )
    fig.update_layout(
        height=320,
        paper_bgcolor="#0f1117",
        plot_bgcolor="#0f1117",
        font_color="#e0e0e0",
        margin=dict(t=20, b=20, l=0, r=0),
    )
    st.plotly_chart(fig, use_container_width=True)

with right:
    st.markdown("### KPIs do projeto")
    st.metric("CAPEX", f"R$ {monthly.get('capex', 0):,.0f}")
    st.metric("Payback", f"{monthly['payback_meses']:.1f} meses" if monthly.get("payback_meses") else "—")
    st.metric("Retorno a.m.", f"{monthly.get('retorno_am', 0) * 100:.2f}%")
    st.metric("Margem EBITDA", f"{monthly.get('margem_ebitda', 0) * 100:.1f}%")

st.markdown("---")
st.markdown("### Itens de orçamento / implantação")
if selected["budget"] is not None:
    st.dataframe(selected["budget"], use_container_width=True, hide_index=True)
else:
    st.info("Este projeto não possui aba de orçamento compatível.")
