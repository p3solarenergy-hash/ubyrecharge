import pandas as pd
import streamlit as st

from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Gestao | Operacao", page_icon="⚙️", layout="wide")
st.title("⚙️ Gestao - Operacao")
st.caption("Acompanhe disponibilidade, uso e situacao dos carregadores por eletroposto.")


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Gestao")


projects = load_projects()
if not projects:
    st.info("Nenhum posto em operacao para exibir.")
    st.stop()

for project in projects:
    with st.expander(f"{project['name']} - {project['site_status_label']}", expanded=False):
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Carregadores", project["charger_count"])
        col2.metric("Disponibilidade", f"{project['availability_pct'] * 100:.1f}%")
        col3.metric("Sessoes mensais", f"{project['sessions_monthly']:,.0f}")
        col4.metric("Energia mensal", f"{project['energy_kwh_monthly']:,.0f} kWh")

        charger_rows = [
            {
                "Carregador": charger.get("id", ""),
                "Tipo": charger.get("type", ""),
                "Potencia (kW)": charger.get("power_kw", 0.0),
                "Status": charger.get("status", ""),
                "Conectores": charger.get("connector_count", 1),
                "Parceiro": charger.get("partner_ref", ""),
            }
            for charger in project.get("chargers", [])
        ]
        if charger_rows:
            st.dataframe(pd.DataFrame(charger_rows), use_container_width=True, hide_index=True)
        else:
            st.info("Sem telemetria individual de carregadores por enquanto.")
