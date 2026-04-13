import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from utils.manager_auth import is_manager_authenticated, show_manager_hint
from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Gestao | Faturamento", page_icon="💸", layout="wide")
st.title("💸 Gestao - Faturamento")
st.caption("Receita, resultado e estrutura financeira dos postos em operacao.")


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Gestao")


projects = load_projects()
if not projects:
    st.info("Nenhum projeto em gestao para faturamento.")
    st.stop()

is_manager = is_manager_authenticated()
rows = []
for project in projects:
    row = {
        "Projeto": project["name"],
        "Parceiro": project["partner_name"],
        "Receita mensal": project["revenue_monthly"],
        "EBITDA mensal": project["ebitda_monthly"],
    }
    if is_manager:
        row["Resultado bruto"] = project["gross_result_monthly"]
        row["Resultado liquido"] = project["net_result_monthly"]
    rows.append(row)

df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

if not df.empty:
    fig = go.Figure()
    fig.add_trace(go.Bar(name="Receita", x=df["Projeto"], y=df["Receita mensal"], marker_color="#00e676"))
    fig.add_trace(go.Bar(name="EBITDA", x=df["Projeto"], y=df["EBITDA mensal"], marker_color="#00c8ff"))
    if is_manager and "Resultado liquido" in df.columns:
        fig.add_trace(go.Bar(name="Resultado liquido", x=df["Projeto"], y=df["Resultado liquido"], marker_color="#ffa500"))
    fig.update_layout(barmode="group", height=360, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117", font_color="#e0e0e0")
    st.plotly_chart(fig, use_container_width=True)

if not is_manager:
    st.info(show_manager_hint("Resultado bruto e liquido ficam protegidos na Area do Gestor."))
