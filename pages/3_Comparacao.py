import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.excel_reader import get_all_projects, parse_full_project, EXCEL_DIR
from utils.calculations import calc_monthly, calc_annual_projection

st.set_page_config(page_title="Comparação | UBY RECHARGE", page_icon="🔀", layout="wide")
st.title("🔀 Comparação de Projetos")

files = get_all_projects()

selected = st.multiselect(
    "Selecione os projetos para comparar (mín. 2):",
    files,
    default=files[:2] if len(files) >= 2 else files,
    format_func=lambda x: x.replace(".xlsx", ""),
)

if len(selected) < 2:
    st.info("Selecione ao menos 2 projetos para comparar.")
    st.stop()

@st.cache_data(ttl=10)
def load_project(fp):
    return parse_full_project(fp)

projects = []
for f in selected:
    fp = os.path.join(EXCEL_DIR, f)
    p = load_project(fp)
    if p["inputs"]:
        m = calc_monthly(p["inputs"])
        p["monthly"] = m
        projects.append(p)

if not projects:
    st.warning("Nenhum projeto com inputs compatíveis.")
    st.stop()

names = [p["name"][:30] for p in projects]
colors = px.colors.qualitative.Plotly[:len(projects)]

# ── Métricas lado a lado ──
st.markdown("### KPIs por Projeto")
cols = st.columns(len(projects))
for i, (p, col) in enumerate(zip(projects, cols)):
    m = p["monthly"]
    col.markdown(f"**{p['name'][:25]}**")
    col.metric("CAPEX", f"R$ {m['capex']:,.0f}")
    col.metric("Receita/mês", f"R$ {m['receita']:,.0f}")
    col.metric("EBITDA/mês", f"R$ {m['ebitda']:,.0f}")
    col.metric("Margem EBITDA", f"{m['margem_ebitda']*100:.1f}%")
    pb = m.get("payback_meses")
    col.metric("Payback", f"{pb:.1f} m" if pb else "—")
    col.metric("Retorno a.m.", f"{m['retorno_am']*100:.2f}%")

st.markdown("---")

# ── Tabela comparativa ──
st.markdown("### Tabela Comparativa")
kpi_rows = []
kpi_labels = {
    "CAPEX (R$)": lambda m: m.get("capex", 0),
    "Receita/mês (R$)": lambda m: m.get("receita", 0),
    "Custo Energia/mês (R$)": lambda m: m.get("custo_energia", 0),
    "Custos Variáveis/mês (R$)": lambda m: m.get("custo_variavel", 0),
    "Custos Fixos/mês (R$)": lambda m: m.get("custos_fixos", 0),
    "EBITDA/mês (R$)": lambda m: m.get("ebitda", 0),
    "Margem EBITDA (%)": lambda m: round(m.get("margem_ebitda", 0) * 100, 1),
    "Payback (meses)": lambda m: round(m.get("payback_meses") or 0, 1),
    "Retorno a.m. (%)": lambda m: round(m.get("retorno_am", 0) * 100, 2),
}
for label, fn in kpi_labels.items():
    row = {"KPI": label}
    for p in projects:
        row[p["name"][:20]] = fn(p["monthly"])
    kpi_rows.append(row)

df_comp = pd.DataFrame(kpi_rows).set_index("KPI")
st.dataframe(df_comp, use_container_width=True)

st.markdown("---")

# ── Gráficos comparativos ──
col1, col2 = st.columns(2)

with col1:
    st.markdown("#### Receita vs EBITDA/mês")
    fig = go.Figure()
    receitas = [p["monthly"]["receita"] for p in projects]
    ebitdas = [p["monthly"]["ebitda"] for p in projects]
    fig.add_trace(go.Bar(name="Receita", x=names, y=receitas, marker_color="#00e676"))
    fig.add_trace(go.Bar(name="EBITDA", x=names, y=ebitdas, marker_color="#00c8ff"))
    fig.update_layout(barmode="group", height=320, paper_bgcolor="#0f1117",
                      plot_bgcolor="#0f1117", font_color="#e0e0e0",
                      legend=dict(orientation="h", y=-0.15),
                      margin=dict(t=10, b=60))
    st.plotly_chart(fig, use_container_width=True)

with col2:
    st.markdown("#### Payback (meses)")
    paybacks = [p["monthly"].get("payback_meses") or 0 for p in projects]
    bar_colors = [colors[i] for i in range(len(projects))]
    fig2 = go.Figure(go.Bar(x=names, y=paybacks, marker_color=bar_colors,
                            text=[f"{v:.1f}m" for v in paybacks], textposition="outside"))
    fig2.update_layout(height=320, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                       font_color="#e0e0e0", margin=dict(t=10, b=60),
                       yaxis_title="meses")
    st.plotly_chart(fig2, use_container_width=True)

# ── Projeção anual comparada ──
st.markdown("### Projeção Anual Comparada")
anos = st.slider("Horizonte (anos)", 1, 15, 10)

fig3 = go.Figure()
for i, p in enumerate(projects):
    proj = calc_annual_projection(p["inputs"], anos=anos)
    df_p = pd.DataFrame(proj)
    fig3.add_trace(go.Scatter(x=df_p["Ano"], y=df_p["EBITDA"],
                              mode="lines+markers", name=p["name"][:20],
                              line=dict(color=colors[i], width=2)))

fig3.update_layout(title="EBITDA Anual por Projeto", height=380,
                   paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                   font_color="#e0e0e0", yaxis_title="R$",
                   legend=dict(orientation="h", y=-0.15),
                   margin=dict(t=30, b=60))
st.plotly_chart(fig3, use_container_width=True)

fig4 = go.Figure()
for i, p in enumerate(projects):
    proj = calc_annual_projection(p["inputs"], anos=anos)
    df_p = pd.DataFrame(proj)
    fig4.add_trace(go.Scatter(x=df_p["Ano"], y=df_p["Fluxo Acumulado"],
                              mode="lines+markers", name=p["name"][:20],
                              line=dict(color=colors[i], width=2)))

fig4.add_hline(y=0, line_dash="dash", line_color="#ff4b4b")
fig4.update_layout(title="Fluxo de Caixa Acumulado por Projeto", height=360,
                   paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                   font_color="#e0e0e0", yaxis_title="R$",
                   legend=dict(orientation="h", y=-0.15),
                   margin=dict(t=30, b=60))
st.plotly_chart(fig4, use_container_width=True)

# ── Radar chart ──
st.markdown("### Radar — Perfil Comparativo")

radar_metrics = ["Receita", "EBITDA", "Margem", "Retorno a.m.", "Payback (inv)"]

def normalize(vals):
    mn, mx = min(vals), max(vals)
    if mx == mn:
        return [0.5] * len(vals)
    return [(v - mn) / (mx - mn) for v in vals]

raw = {
    "Receita": [p["monthly"]["receita"] for p in projects],
    "EBITDA": [p["monthly"]["ebitda"] for p in projects],
    "Margem": [p["monthly"]["margem_ebitda"] for p in projects],
    "Retorno a.m.": [p["monthly"]["retorno_am"] for p in projects],
    "Payback (inv)": [1 / (p["monthly"]["payback_meses"] or 999) for p in projects],
}

fig5 = go.Figure()
for i, p in enumerate(projects):
    vals_norm = [normalize(raw[m])[i] for m in radar_metrics]
    vals_norm.append(vals_norm[0])
    labels = radar_metrics + [radar_metrics[0]]
    fig5.add_trace(go.Scatterpolar(r=vals_norm, theta=labels, fill="toself",
                                   name=p["name"][:20], line_color=colors[i]))

fig5.update_layout(polar=dict(radialaxis=dict(visible=True, range=[0, 1])),
                   showlegend=True, height=420,
                   paper_bgcolor="#0f1117", font_color="#e0e0e0",
                   margin=dict(t=20, b=20))
st.plotly_chart(fig5, use_container_width=True)
