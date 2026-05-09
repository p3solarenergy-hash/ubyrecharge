"""
Métricas e Insights — análise financeira + dicas automáticas
"""
import plotly.graph_objects as go
import streamlit as st

from utils.p3_styles import inject, page_header, section_title

inject()

# ─── DADOS PLACEHOLDER (substituir por Supabase futuramente) ─────────────────
MESES = ["Nov/25","Dez/25","Jan/26","Fev/26","Mar/26","Abr/26","Mai/26"]

RECEITA  = [0,    0,    1200, 2100, 3200, 5800, 6480]
EBITDA   = [0,    0,    540,  945,  1440, 2610, 2916]
SESSOES  = [0,    0,    38,   67,   102,  185,  207]
OCUPACAO = [0,    0,    12,   21,   32,   54,   57]

# KPIs atuais (último mês)
kpi = {
    "receita_mes":   6480.00,
    "ebitda_mes":    2916.00,
    "margem":        45.0,
    "sessoes_mes":   207,
    "kwh_mes":       6210,
    "ticket_medio":  31.30,
    "carregadores":  2,
    "obras_ativas":  1,
    "obras_estudo":  1,
    "prospecoes":    3,
}

# ─── PÁGINA ───────────────────────────────────────────────────────────────────
page_header(
    "📈 Métricas e Insights",
    "Visão financeira consolidada e análises automáticas da operação.",
)

# ── KPIs principais ──────────────────────────────────────────────────────────
c1, c2, c3, c4 = st.columns(4)
c1.metric("Receita (mês)",    f"R$ {kpi['receita_mes']:,.0f}".replace(",","."),  delta="+12% vs mês ant.")
c2.metric("EBITDA (mês)",     f"R$ {kpi['ebitda_mes']:,.0f}".replace(",","."),  delta="+11% vs mês ant.")
c3.metric("Margem EBITDA",    f"{kpi['margem']:.0f}%",                          delta="-1pp vs mês ant.")
c4.metric("Ticket médio/sessão", f"R$ {kpi['ticket_medio']:.2f}".replace(".",","))

st.markdown("")
c5, c6, c7, c8 = st.columns(4)
c5.metric("Sessões (mês)",   kpi["sessoes_mes"],  delta="+12%")
c6.metric("Energia entregue", f"{kpi['kwh_mes']:,} kWh".replace(",","."))
c7.metric("Obras ativas",    kpi["obras_ativas"])
c8.metric("Em prospecção",   kpi["prospecoes"])

st.markdown("---")

# ── Gráfico evolução ─────────────────────────────────────────────────────────
section_title("Evolução Mensal")

fig = go.Figure()
fig.add_trace(go.Bar(
    x=MESES, y=RECEITA, name="Receita (R$)",
    marker_color="#3FB66B", marker_line_width=0, opacity=0.9,
))
fig.add_trace(go.Bar(
    x=MESES, y=EBITDA, name="EBITDA (R$)",
    marker_color="#5BC882", marker_line_width=0, opacity=0.9,
))
fig.add_trace(go.Scatter(
    x=MESES, y=OCUPACAO, name="Ocupação (%)",
    yaxis="y2", mode="lines+markers",
    line=dict(color="#FFD66B", width=2),
    marker=dict(size=6),
))
fig.update_layout(
    barmode="group", height=360,
    paper_bgcolor="#16221E", plot_bgcolor="#16221E", font_color="#E8EFEB",
    legend=dict(orientation="h", yanchor="bottom", y=1.02),
    yaxis=dict(title="R$", gridcolor="#2A3530"),
    yaxis2=dict(title="Ocupação (%)", overlaying="y", side="right", range=[0,100], gridcolor="rgba(0,0,0,0)"),
    margin=dict(t=10, b=10),
)
st.plotly_chart(fig, use_container_width=True)

st.markdown("---")

# ── Insights automáticos ─────────────────────────────────────────────────────
section_title("💡 Insights P3 Energy")

col_i1, col_i2 = st.columns(2)

with col_i1:
    with st.container(border=True):
        st.markdown("🟢 **Crescimento consistente**")
        st.markdown(
            "A receita cresceu **+12%** no último mês e acumula **+440%** desde janeiro. "
            "O ritmo atual sugere break-even operacional em **agosto/2026** com os 2 carregadores ativos.",
            unsafe_allow_html=False,
        )

    with st.container(border=True):
        st.markdown("🟡 **Margem pressionada**")
        st.markdown(
            "A margem EBITDA caiu 1pp. Revise os custos de energia — "
            "se a tarifa pico/fora-pico não estiver otimizada, "
            "pode custar R$ 300–500/mês extras neste perfil de uso.",
        )

with col_i2:
    with st.container(border=True):
        st.markdown("🔵 **Ticket médio abaixo do mercado**")
        st.markdown(
            f"Seu ticket médio de **R$ {kpi['ticket_medio']:.2f}** por sessão está abaixo da média nacional (R$ 38–45). "
            "Considere revisar a precificação por kWh para os próximos contratos.",
        )

    with st.container(border=True):
        st.markdown("🟢 **Potencial de escala**")
        st.markdown(
            f"Com **{kpi['prospecoes']} sites em prospecção** e 1 em obra, "
            "o pipeline pode dobrar a receita nos próximos 6 meses. "
            "Priorize os sites com maior fluxo de veículos e padrão elétrico adequado.",
        )

st.markdown("---")

# ── Simulador rápido ─────────────────────────────────────────────────────────
section_title("🧮 Simulador de Receita")

col_s1, col_s2, col_s3 = st.columns(3)
n_carregadores  = col_s1.number_input("Carregadores", min_value=1, max_value=20, value=2)
ocup_sim        = col_s2.slider("Ocupação estimada (%)", 10, 100, 55)
preco_kwh       = col_s3.number_input("Preço por kWh (R$)", min_value=0.5, max_value=5.0, value=1.80, step=0.05)

potencia_total  = n_carregadores * 60  # kW
horas_dia       = 24
kwh_disponivel  = potencia_total * horas_dia * 30  # mês
kwh_gerado      = kwh_disponivel * (ocup_sim / 100)
receita_sim     = kwh_gerado * preco_kwh

r1, r2, r3 = st.columns(3)
r1.metric("kWh entregue/mês", f"{kwh_gerado:,.0f}".replace(",","."))
r2.metric("Receita estimada",  f"R$ {receita_sim:,.0f}".replace(",","."))
r3.metric("EBITDA est. (45%)", f"R$ {receita_sim*0.45:,.0f}".replace(",","."))

st.markdown("---")
st.caption("P3 Energy • Dados simulados — conecte ao Supabase para métricas reais.")
