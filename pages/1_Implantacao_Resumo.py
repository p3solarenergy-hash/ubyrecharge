import pandas as pd
import plotly.express as px
import streamlit as st

from utils.manager_auth import is_manager_authenticated, show_manager_hint
from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Implantacao | Resumo", page_icon="📍", layout="wide")
st.title("📍 Resumo de Implantacao")
st.caption("Visao consolidada dos projetos em estruturacao, obra e comissionamento.")


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Implantacao")


projects = load_projects()
if not projects:
    st.info("Nenhum projeto na fase de implantacao.")
    st.stop()

is_manager = is_manager_authenticated()

count_em_obra = sum(1 for project in projects if project["site_status"] == "em_obra")
count_comissionamento = sum(1 for project in projects if project["site_status"] == "comissionamento")
total_capex = sum(project["monthly"].get("capex", 0) for project in projects)

top = st.columns(4)
top[0].metric("Projetos em implantacao", len(projects))
top[1].metric("Em obra", count_em_obra)
top[2].metric("Comissionamento", count_comissionamento)
top[3].metric("CAPEX total", f"R$ {total_capex:,.0f}" if is_manager else show_manager_hint())

rows = []
for project in projects:
    rows.append(
        {
            "Projeto": project["name"],
            "Status": project["site_status_label"],
            "Endereco": project["address"],
            "Parceiro": project["partner_name"],
            "Carregadores": project["charger_count"],
            "CAPEX": project["monthly"].get("capex", 0),
            "Receita projetada": project["revenue_monthly"],
            "EBITDA projetado": project["ebitda_monthly"],
        }
    )

st.markdown("---")
st.markdown("### Pipeline de implantacao")
df = pd.DataFrame(rows)
visible_df = df.copy()
if not is_manager:
    visible_df = visible_df.drop(columns=["CAPEX"])
st.dataframe(visible_df, use_container_width=True, hide_index=True)

left, right = st.columns(2)
with left:
    status_counts = df["Status"].value_counts().reset_index()
    status_counts.columns = ["Status", "Projetos"]
    fig = px.bar(status_counts, x="Status", y="Projetos", color="Status", color_discrete_sequence=px.colors.qualitative.Safe)
    fig.update_layout(height=320, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117", font_color="#e0e0e0", showlegend=False)
    st.plotly_chart(fig, use_container_width=True)

with right:
    metric_df = df[["Projeto", "Receita projetada", "EBITDA projetado"]].copy()
    fig = px.bar(metric_df, x="Projeto", y=["Receita projetada", "EBITDA projetado"], barmode="group")
    fig.update_layout(height=320, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117", font_color="#e0e0e0")
    st.plotly_chart(fig, use_container_width=True)
