import os
import sys

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.excel_reader import EXCEL_DIR, get_all_projects_cached, parse_full_project
from utils.manager_auth import logout_manager, render_manager_login


def _money(value) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _project_financials(project: dict) -> dict:
    schema = project.get("schema", {}) or {}
    finance = schema.get("finance", {}) or {}
    operations = schema.get("operations", {}) or {}
    costs = schema.get("costs", {}) or {}
    monthly = project.get("monthly", {}) or {}

    capex = _money(schema.get("investment", {}).get("capex_total") or schema.get("implantation", {}).get("capex_total"))
    revenue = _money(finance.get("revenue_monthly"))
    ebitda = _money(finance.get("ebitda_monthly"))
    gross_result = _money(finance.get("gross_result_monthly"))
    net_result = _money(finance.get("net_result_monthly"))
    energy_cost = _money(monthly.get("custo_energia"))
    fixed_costs = _money(costs.get("fixed_costs_monthly") or monthly.get("custos_fixos"))
    variable_costs = max(revenue - energy_cost - fixed_costs - ebitda, 0.0)
    payback_months = capex / net_result if capex > 0 and net_result > 0 else None
    return_am = net_result / capex if capex > 0 else 0.0
    ebitda_margin = ebitda / revenue if revenue > 0 else 0.0

    return {
        "capex": capex,
        "revenue": revenue,
        "energy_cost": energy_cost,
        "variable_costs": variable_costs,
        "fixed_costs": fixed_costs,
        "ebitda": ebitda,
        "gross_result": gross_result,
        "net_result": net_result,
        "payback_months": payback_months,
        "return_am": return_am,
        "ebitda_margin": ebitda_margin,
        "sessions_monthly": _money(operations.get("sessions_monthly")),
        "energy_kwh_monthly": _money(operations.get("energy_kwh_monthly")),
    }


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


@st.cache_data(ttl=30, show_spinner=False)
def load_projects():
    projects = []
    for filename in get_all_projects_cached():
        filepath = os.path.join(EXCEL_DIR, filename)
        project = parse_full_project(filepath)
        if project.get("inputs"):
            projects.append(project)
    return projects


projects = load_projects()
if not projects:
    st.warning("Nenhuma planilha encontrada.")
    st.stop()

project_rows = []
for project in projects:
    financials = _project_financials(project)
    project_rows.append(
        {
            "Projeto": project["name"],
            "CAPEX (R$)": financials["capex"],
            "Receita/mês (R$)": financials["revenue"],
            "Custo Energia/mês (R$)": financials["energy_cost"],
            "Custos Variáveis/mês (R$)": financials["variable_costs"],
            "Custos Fixos/mês (R$)": financials["fixed_costs"],
            "EBITDA/mês (R$)": financials["ebitda"],
            "Resultado Líquido/mês (R$)": financials["net_result"],
            "Payback (meses)": round(financials["payback_months"], 1) if financials["payback_months"] else "—",
            "Retorno a.m. (%)": round(financials["return_am"] * 100, 2),
        }
    )

total_capex = sum(row["CAPEX (R$)"] for row in project_rows)
total_ebitda = sum(row["EBITDA/mês (R$)"] for row in project_rows)
paybacks = [row["Payback (meses)"] for row in project_rows if isinstance(row["Payback (meses)"], (int, float))]
avg_payback = sum(paybacks) / len(paybacks) if paybacks else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Projetos monitorados", len(project_rows))
c2.metric("CAPEX total", f"R$ {total_capex:,.0f}")
c3.metric("EBITDA mensal total", f"R$ {total_ebitda:,.0f}")
c4.metric("Payback médio", f"{avg_payback:.1f} meses" if avg_payback else "—")

st.markdown("---")
st.markdown("### Resumo financeiro")
df_summary = pd.DataFrame(project_rows)
st.dataframe(df_summary, use_container_width=True, hide_index=True)

st.markdown("---")

selected = st.selectbox(
    "Projeto para detalhar",
    projects,
    format_func=lambda project: project["name"],
)
financials = _project_financials(selected)

left, right = st.columns([2, 1])
with left:
    st.markdown("### Estrutura de custos")
    fig = go.Figure(
        go.Bar(
            x=["Receita", "Energia", "Custos Variáveis", "Custos Fixos", "EBITDA"],
            y=[
                financials["revenue"],
                -financials["energy_cost"],
                -financials["variable_costs"],
                -financials["fixed_costs"],
                financials["ebitda"],
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
    st.metric("CAPEX", f"R$ {financials['capex']:,.0f}")
    st.metric("Payback", f"{financials['payback_months']:.1f} meses" if financials["payback_months"] else "—")
    st.metric("Retorno a.m.", f"{financials['return_am'] * 100:.2f}%")
    st.metric("Margem EBITDA", f"{financials['ebitda_margin'] * 100:.1f}%")
    st.metric("Resultado líquido/mês", f"R$ {financials['net_result']:,.2f}")

st.markdown("---")
st.markdown("### Itens de orçamento / implantação")
if selected["budget"] is not None:
    st.dataframe(selected["budget"], use_container_width=True, hide_index=True)
else:
    st.info("Este projeto não possui aba de orçamento compatível.")
