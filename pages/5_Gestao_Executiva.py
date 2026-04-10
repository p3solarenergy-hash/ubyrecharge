import pandas as pd
import plotly.express as px
import streamlit as st

from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Gestao | Visao Executiva", page_icon="📊", layout="wide")
st.title("📊 Gestao - Visao Executiva")
st.caption("Painel consolidado dos eletropostos em operacao ou acompanhamento de gestao.")


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Gestao")


projects = load_projects()
if not projects:
    st.info("Nenhum projeto em gestao ainda.")
    st.stop()

total_revenue = sum(project["revenue_monthly"] for project in projects)
total_ebitda = sum(project["ebitda_monthly"] for project in projects)
avg_availability = sum(project["availability_pct"] for project in projects) / len(projects) if projects else 0
total_sessions = sum(project["sessions_monthly"] for project in projects)

top = st.columns(4)
top[0].metric("Postos em gestao", len(projects))
top[1].metric("Receita mensal", f"R$ {total_revenue:,.0f}")
top[2].metric("EBITDA mensal", f"R$ {total_ebitda:,.0f}")
top[3].metric("Disponibilidade media", f"{avg_availability * 100:.1f}%")

rows = [
    {
        "Projeto": project["name"],
        "Parceiro": project["partner_name"],
        "Receita": project["revenue_monthly"],
        "EBITDA": project["ebitda_monthly"],
        "Disponibilidade": project["availability_pct"] * 100,
        "Sessoes": project["sessions_monthly"],
    }
    for project in projects
]
df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

if not df.empty:
    fig = px.scatter(
        df,
        x="Receita",
        y="EBITDA",
        size="Disponibilidade",
        color="Parceiro",
        hover_name="Projeto",
    )
    fig.update_layout(height=380, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117", font_color="#e0e0e0")
    st.plotly_chart(fig, use_container_width=True)

st.caption(f"Sessoes mensais consolidadas: {total_sessions:,.0f}")
