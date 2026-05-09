"""
Taxa de Ocupação — geral e por carregador
"""
import plotly.graph_objects as go
import streamlit as st

from utils.p3_styles import inject, page_header, section_title

inject()

# ─── DADOS PLACEHOLDER (substituir por API real dos carregadores) ─────────────
# Quando a integração com o app dos carregadores estiver ativa,
# esses dados virão em tempo real via API / Supabase.
CARREGADORES = [
    {
        "id": "RB-01", "nome": "Rio Beach EV #1", "local": "Barra da Tijuca - RJ",
        "kw": 60, "status": "online",
        "ocupacao_hoje": 67, "ocupacao_semana": 54, "ocupacao_mes": 48,
        "sessoes_mes": 142, "kwh_mes": 4260, "receita_mes": 3834.00,
        "ocupacao_hora": [5,5,3,2,1,2,8,18,32,45,55,60,72,68,58,50,55,63,70,67,55,42,28,12],
    },
    {
        "id": "RB-02", "nome": "Rio Beach EV #2", "local": "Barra da Tijuca - RJ",
        "kw": 60, "status": "online",
        "ocupacao_hoje": 41, "ocupacao_semana": 38, "ocupacao_mes": 35,
        "sessoes_mes": 98,  "kwh_mes": 2940, "receita_mes": 2646.00,
        "ocupacao_hora": [2,2,1,1,0,1,5,12,20,30,38,42,48,50,44,38,40,42,45,41,35,25,15,5],
    },
]

STATUS_COLOR = {"online": ("#3FB66B", "🟢 Online"), "offline": ("#E55545", "🔴 Offline"), "ocupado": ("#F2A93D", "🟡 Ocupado")}
HORAS = [f"{h:02d}h" for h in range(24)]

# ─── PÁGINA ───────────────────────────────────────────────────────────────────
page_header(
    "🔌 Taxa de Ocupação",
    "Monitoramento de uso dos carregadores. Dados reais disponíveis após integração com o app.",
)

# ── Alerta de integração pendente ────────────────────────────────────────────
st.info(
    "📡 **Integração pendente:** Os dados abaixo são simulados. "
    "Quando o app dos carregadores for conectado, as métricas serão atualizadas em tempo real.",
    icon="ℹ️",
)

# ── Métricas gerais ──────────────────────────────────────────────────────────
total_sessoes = sum(c["sessoes_mes"] for c in CARREGADORES)
total_kwh     = sum(c["kwh_mes"]     for c in CARREGADORES)
total_receita = sum(c["receita_mes"] for c in CARREGADORES)
ocup_media    = sum(c["ocupacao_mes"] for c in CARREGADORES) / len(CARREGADORES)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Ocupação média (mês)",  f"{ocup_media:.0f}%")
c2.metric("Sessões no mês",        total_sessoes)
c3.metric("Energia entregue",      f"{total_kwh:,} kWh".replace(",", "."))
c4.metric("Receita estimada",      f"R$ {total_receita:,.2f}".replace(",","X").replace(".",",").replace("X","."))

st.markdown("---")

# ── Cards por carregador ──────────────────────────────────────────────────────
section_title("Por Carregador")

for c in CARREGADORES:
    cor_status, label_status = STATUS_COLOR.get(c["status"], ("#8FA39A", "Desconhecido"))
    ocup = c["ocupacao_hoje"]
    cor_barra = "#E55545" if ocup > 90 else "#F2A93D" if ocup > 70 else "#3FB66B"

    with st.container(border=True):
        h1, h2 = st.columns([5, 1])
        with h1:
            st.markdown(f"**{c['nome']}** &nbsp; `{c['id']}`")
            st.caption(f"{c['local']} • {c['kw']} kW")
        with h2:
            st.markdown(
                f"<span style='color:{cor_status};font-size:12px;font-weight:700'>{label_status}</span>",
                unsafe_allow_html=True,
            )

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Ocupação hoje",   f"{c['ocupacao_hoje']}%")
        m2.metric("Ocupação semana", f"{c['ocupacao_semana']}%")
        m3.metric("Ocupação mês",    f"{c['ocupacao_mes']}%")
        m4.metric("Sessões/mês",     c["sessoes_mes"])

        st.markdown(
            f"""<div style='background:#2A3530;border-radius:6px;height:8px;margin:8px 0'>
            <div style='background:{cor_barra};width:{ocup}%;height:8px;border-radius:6px'></div>
            </div><p style='color:var(--p3-muted);font-size:11px'>{ocup}% de ocupação agora</p>""",
            unsafe_allow_html=True,
        )

st.markdown("---")

# ── Gráfico horário ──────────────────────────────────────────────────────────
section_title("Ocupação por Hora do Dia (hoje)")

fig = go.Figure()
for c in CARREGADORES:
    fig.add_trace(go.Scatter(
        x=HORAS, y=c["ocupacao_hora"], name=c["nome"],
        mode="lines+markers", line=dict(width=2),
        fill="tozeroy", fillcolor="rgba(63,182,107,0.08)",
    ))
fig.update_layout(
    height=320,
    paper_bgcolor="#16221E", plot_bgcolor="#16221E",
    font_color="#E8EFEB",
    legend=dict(orientation="h", yanchor="bottom", y=1.02),
    yaxis=dict(title="Ocupação (%)", range=[0, 100]),
    xaxis=dict(title="Hora"),
    margin=dict(t=10, b=10),
)
st.plotly_chart(fig, use_container_width=True)

st.markdown("---")
st.caption("P3 Energy • Dados simulados — integração com OCPP/MQTT em desenvolvimento.")
