import pandas as pd
import streamlit as st

from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Implantacao | Cronograma", page_icon="🗓️", layout="wide")
st.title("🗓️ Cronograma de Implantacao")
st.caption("Acompanhamento macro dos projetos entre planejamento, obra e comissionamento.")

PROGRESS_BY_STATUS = {
    "planejado": 0.15,
    "em_obra": 0.55,
    "comissionamento": 0.85,
    "ativo": 1.0,
    "inativo": 1.0,
    "alerta": 0.7,
}


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Implantacao")


projects = load_projects()
if not projects:
    st.info("Nenhum projeto de implantacao disponivel.")
    st.stop()

rows = []
for project in projects:
    progress = PROGRESS_BY_STATUS.get(project["site_status"], 0.2)
    rows.append(
        {
            "Projeto": project["name"],
            "Status": project["site_status_label"],
            "Endereco": project["address"],
            "Parceiro": project["partner_name"],
            "Progresso": progress,
        }
    )

for row in rows:
    st.markdown(f"**{row['Projeto']}**")
    st.caption(f"{row['Status']} • {row['Parceiro']} • {row['Endereco']}")
    st.progress(row["Progresso"], text=f"{int(row['Progresso'] * 100)}%")

st.markdown("---")
st.markdown("### Tabela resumida")
df = pd.DataFrame(rows)
df["Progresso"] = (df["Progresso"] * 100).round(0).astype(int).astype(str) + "%"
st.dataframe(df, use_container_width=True, hide_index=True)
