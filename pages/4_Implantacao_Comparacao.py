import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from utils.manager_auth import is_manager_authenticated
from utils.project_portfolio import filter_projects, load_portfolio_projects

st.set_page_config(page_title="Implantacao | Comparacao", page_icon="🔄", layout="wide")
st.title("🔄 Comparacao de Implantacao")
st.caption("Compare viabilidade, capacidade instalada e potencial economico entre projetos em implantacao.")


@st.cache_data(ttl=10)
def load_projects():
    return filter_projects(load_portfolio_projects(), "Implantacao")


projects = load_projects()
if len(projects) < 2:
    st.info("Selecione ao menos dois projetos em implantacao para comparar.")
    st.stop()

is_manager = is_manager_authenticated()
options = [project["name"] for project in projects]
selected_names = st.multiselect("Projetos", options, default=options[: min(3, len(options))])
selected = [project for project in projects if project["name"] in selected_names]

if len(selected) < 2:
    st.stop()

rows = []
for project in selected:
    row = {
        "Projeto": project["name"],
        "Status": project["site_status_label"],
        "Carregadores": project["charger_count"],
        "Receita projetada": project["revenue_monthly"],
        "EBITDA projetado": project["ebitda_monthly"],
    }
    if is_manager:
        row["CAPEX"] = project["monthly"].get("capex", 0)
        row["Payback"] = round(project["monthly"].get("payback_meses") or 0, 1)
    rows.append(row)

df = pd.DataFrame(rows)
st.dataframe(df, use_container_width=True, hide_index=True)

fig = go.Figure()
fig.add_trace(go.Bar(name="Receita projetada", x=df["Projeto"], y=df["Receita projetada"], marker_color="#00e676"))
fig.add_trace(go.Bar(name="EBITDA projetado", x=df["Projeto"], y=df["EBITDA projetado"], marker_color="#00c8ff"))
if is_manager and "CAPEX" in df.columns:
    fig.add_trace(go.Scatter(name="CAPEX", x=df["Projeto"], y=df["CAPEX"], mode="lines+markers", yaxis="y2", line=dict(color="#ffa500")))
fig.update_layout(
    barmode="group",
    height=380,
    paper_bgcolor="#0f1117",
    plot_bgcolor="#0f1117",
    font_color="#e0e0e0",
    yaxis2=dict(overlaying="y", side="right", showgrid=False, visible=is_manager and "CAPEX" in df.columns),
)
st.plotly_chart(fig, use_container_width=True)
