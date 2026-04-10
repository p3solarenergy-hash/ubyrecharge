import pandas as pd
import streamlit as st

from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Gestao | Parceiros", page_icon="🤝", layout="wide")
st.title("🤝 Parceiros e Integracoes")
st.caption("Camada tecnica da origem dos dados operacionais e financeiros por parceiro.")


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Gestao")


projects = load_projects()
if not projects:
    st.info("Nenhum projeto em gestao com integracao para mostrar.")
    st.stop()

rows = [
    {
        "Projeto": project["name"],
        "Parceiro": project["partner_name"],
        "Origem": project["source_type"],
        "Status do posto": project["site_status_label"],
        "Carregadores": project["charger_count"],
        "Disponibilidade": f"{project['availability_pct'] * 100:.1f}%",
    }
    for project in projects
]
df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

if not df.empty:
    summary = (
        df.groupby(["Parceiro", "Origem"], dropna=False)
        .agg(Postos=("Projeto", "count"), Carregadores=("Carregadores", "sum"))
        .reset_index()
    )
    st.markdown("### Resumo por parceiro")
    st.dataframe(summary, use_container_width=True, hide_index=True)
