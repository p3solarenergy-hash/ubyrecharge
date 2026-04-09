import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.excel_reader import get_all_projects, parse_full_project, EXCEL_DIR
from utils.calculations import calc_monthly, safe_float

st.set_page_config(page_title="Dashboard | UBY RECHARGE", page_icon="📊", layout="wide")
st.title("📊 Dashboard — Visão Geral dos Projetos")

st.markdown("""
<style>
div[data-testid="metric-container"] {
    background: #1e2130; border-radius: 8px; padding: 12px;
    border-left: 3px solid #00c8ff;
}
</style>""", unsafe_allow_html=True)

@st.cache_data(ttl=10)
def load_all():
    projects = []
    for f in get_all_projects():
        fp = os.path.join(EXCEL_DIR, f)
        p = parse_full_project(fp)
        if p["inputs"]:
            m = calc_monthly(p["inputs"])
            p["monthly"] = m
            projects.append(p)
    return projects

with st.spinner("Carregando projetos..."):
    projects = load_all()

if not projects:
    st.warning("Nenhum projeto com dados de Inputs encontrado.")
    st.stop()

st.success(f"{len(projects)} projeto(s) carregado(s)")
st.markdown("---")

# ── KPI cards globais ──
total_capex = sum(p["monthly"].get("capex", 0) for p in projects)
total_receita = sum(p["monthly"].get("receita", 0) for p in projects)
total_ebitda = sum(p["monthly"].get("ebitda", 0) for p in projects)
projetos_payback = [
    p["monthly"]["payback_meses"]
    for p in projects
    if p["monthly"].get("payback_meses") and p["monthly"]["payback_meses"] > 0
]
avg_payback = sum(projetos_payback) / len(projetos_payback) if projetos_payback else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Projetos ativos", len(projects))
c2.metric("CAPEX total", f"R$ {total_capex:,.0f}")
c3.metric("Receita mensal total", f"R$ {total_receita:,.0f}")
c4.metric("EBITDA mensal total", f"R$ {total_ebitda:,.0f}")

st.markdown("---")

# ── Tabela resumo ──
st.markdown("### Resumo por Projeto")

rows = []
for p in projects:
    m = p["monthly"]
    rows.append({
        "Projeto": p["name"],
        "CAPEX (R$)": m.get("capex", 0),
        "Receita/mês (R$)": m.get("receita", 0),
        "EBITDA/mês (R$)": m.get("ebitda", 0),
        "Margem EBITDA": f"{m.get('margem_ebitda', 0)*100:.1f}%",
        "Payback (meses)": round(m["payback_meses"], 1) if m.get("payback_meses") else "—",
        "Retorno a.m.": f"{m.get('retorno_am', 0)*100:.2f}%",
    })

df_summary = pd.DataFrame(rows)
st.dataframe(
    df_summary.style.format({
        "CAPEX (R$)": "R$ {:,.0f}",
        "Receita/mês (R$)": "R$ {:,.0f}",
        "EBITDA/mês (R$)": "R$ {:,.0f}",
    }),
    use_container_width=True,
    hide_index=True,
)

st.markdown("---")

# ── Gráficos ──
col_a, col_b = st.columns(2)

with col_a:
    st.markdown("#### CAPEX por Projeto")
    names = [p["name"][:30] for p in projects]
    capexes = [p["monthly"].get("capex", 0) for p in projects]
    fig = px.bar(x=names, y=capexes, labels={"x": "", "y": "R$"},
                 color=capexes, color_continuous_scale="Blues")
    fig.update_layout(showlegend=False, margin=dict(t=10, b=60), height=320,
                      paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                      font_color="#e0e0e0", coloraxis_showscale=False)
    fig.update_xaxes(tickangle=-30)
    st.plotly_chart(fig, use_container_width=True)

with col_b:
    st.markdown("#### EBITDA mensal por Projeto")
    ebitdas = [p["monthly"].get("ebitda", 0) for p in projects]
    colors = ["#00c8ff" if e > 0 else "#ff4b4b" for e in ebitdas]
    fig2 = go.Figure(go.Bar(x=names, y=ebitdas, marker_color=colors))
    fig2.update_layout(margin=dict(t=10, b=60), height=320,
                       paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                       font_color="#e0e0e0")
    fig2.update_xaxes(tickangle=-30)
    st.plotly_chart(fig2, use_container_width=True)

# ── Scatter: CAPEX x Payback ──
st.markdown("#### CAPEX vs Payback (por projeto)")
scatter_data = [
    {"Projeto": p["name"][:25], "CAPEX": p["monthly"].get("capex", 0),
     "Payback": p["monthly"].get("payback_meses") or 0,
     "EBITDA": p["monthly"].get("ebitda", 0)}
    for p in projects if p["monthly"].get("payback_meses")
]
if scatter_data:
    df_sc = pd.DataFrame(scatter_data)
    fig3 = px.scatter(df_sc, x="CAPEX", y="Payback", size="EBITDA", text="Projeto",
                      color="EBITDA", color_continuous_scale="teal",
                      labels={"CAPEX": "CAPEX (R$)", "Payback": "Payback (meses)"})
    fig3.update_traces(textposition="top center")
    fig3.update_layout(height=400, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                       font_color="#e0e0e0", coloraxis_showscale=False)
    st.plotly_chart(fig3, use_container_width=True)
