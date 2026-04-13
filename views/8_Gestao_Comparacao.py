import pandas as pd
import plotly.express as px
import streamlit as st

from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Gestao | Comparacao", page_icon="📈", layout="wide")
st.title("📈 Comparacao Operacional")
st.caption("Compare os postos ativos por desempenho operacional e financeiro.")


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Gestao")


projects = load_projects()
if len(projects) < 2:
    st.info("Ainda nao ha postos suficientes em gestao para comparar.")
    st.stop()

rows = [
    {
        "Projeto": project["name"],
        "Parceiro": project["partner_name"],
        "Receita": project["revenue_monthly"],
        "EBITDA": project["ebitda_monthly"],
        "Disponibilidade": project["availability_pct"] * 100,
        "Energia": project["energy_kwh_monthly"],
    }
    for project in projects
]
df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

if not df.empty:
    fig = px.parallel_coordinates(df, color="EBITDA", dimensions=["Receita", "EBITDA", "Disponibilidade", "Energia"])
    fig.update_layout(height=420, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117", font_color="#e0e0e0")
    st.plotly_chart(fig, use_container_width=True)
