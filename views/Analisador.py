"""
Analisador — Central de Relatórios de Carga
============================================
Adicione novos relatórios na lista RELATORIOS abaixo.
Cada entrada gera automaticamente um card na página.

Para os links funcionarem, o repositório de relatórios precisa estar
publicado no GitHub Pages. Configure a URL base em RELATORIOS_BASE_URL.
"""

import plotly.graph_objects as go
import streamlit as st

from utils.p3_styles import inject, page_header, section_title

inject()

# ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────

# URL base do GitHub Pages onde os HTMLs dos relatórios estão publicados.
# Exemplo: "https://p3solarenergy.github.io/p3-energy-relatorios"
# Deixe vazio ("") para desabilitar os links enquanto o Pages não estiver no ar.
RELATORIOS_BASE_URL = "https://p3solarenergy-hash.github.io/p3-energy-relatorios"

# ─── CADASTRO DE RELATÓRIOS ──────────────────────────────────────────────────
# Adicione uma entrada aqui sempre que gerar relatórios novos.

RELATORIOS = [
    {
        "id": "malassise-rk",
        "title": "Posto Malassise R.K.",
        "cliente": "Malassise Robert Koch",
        "cidade": "Maringá - PR",
        "data": "26/06/2026",
        "arquivo":           "Relatorio_Analise_Carga_Malassise_RK.html",
        "arquivo_eletrico":  "Relatorio_Eletrico_Malassise_RK.html",
        "arquivo_carregador":"Relatorio_Carregador_Malassise_RK.html",
        "status": "warn",          # ok | warn | danger
        "status_label": "Atenção",
        "pico_kw": 75.99,
        "pico_kva": 76.00,
        "fp": 0.77,
        "demanda_kw": 9.67,
        "consumo_kwh": 2879.82,
        "consumo_dias": 16,
        "padrao_atual": 150,
        "padrao_proposto": 200,
        "ev_kw": 55,
        "flags": ["Com carregador", "EV 55 kW atual", "Ensaio 60 kW", "DLM necessário"],
    },
    {
        "id": "malassise-araguaia",
        "title": "Posto Malassise Araguaia",
        "cliente": "Malassise Araguaia",
        "cidade": "Maringá - PR",
        "data": "02/05/2026",
        "arquivo":           "Relatorio_Analise_Carga_Araguaia.html",
        "arquivo_eletrico":  "Relatorio_Eletrico_Araguaia.html",
        "arquivo_carregador":"Relatorio_Carregador_Araguaia.html",
        "status": "ok",
        "status_label": "OK",
        "pico_kw": 44.18,
        "pico_kva": 44.34,
        "fp": 0.95,
        "demanda_kw": 30.25,
        "consumo_kwh": 3094.31,
        "consumo_dias": 9,
        "padrao_atual": 150,
        "padrao_proposto": 200,
        "ev_kw": 60,
        "flags": ["Geração FV provável", "Demanda elevada"],
    },
    {
        "id": "avmaringa",
        "title": "Posto Duim Av. Maringá",
        "cliente": "Posto Duim",
        "cidade": "Maringá - PR",
        "data": "14/05/2026",
        "arquivo":           "Relatorio_Analise_Carga_AvMaringa.html",
        "arquivo_eletrico":  "Relatorio_Eletrico_AvMaringa.html",
        "arquivo_carregador":"Relatorio_Carregador_AvMaringa.html",
        "status": "warn",
        "status_label": "Atenção",
        "pico_kw": 39,
        "pico_kva": 47.0,
        "fp": 0.83,
        "demanda_kw": 15,
        "consumo_kwh": 1264.47,
        "consumo_dias": 5,
        "padrao_atual": 200,
        "padrao_proposto": 250,
        "ev_kw": 60,
        "flags": ["FP estimado", "Desequilíbrio Fase B", "Dados parciais", "220/380 V"],
    },
    {
        "id": "muffatao-cascavel",
        "title": "Muffatão Cascavel",
        "cliente": "Muffatão Cascavel",
        "cidade": "Cascavel - PR",
        "data": "16/05/2026",
        "arquivo":           "Relatorio_Analise_Carga_Muffatao_Cascavel.html",
        "arquivo_eletrico":  "Relatorio_Eletrico_Muffatao_Cascavel.html",
        "arquivo_carregador":"Relatorio_Carregador_Muffatao_Cascavel.html",
        "status": "warn",
        "status_label": "Preliminar",
        "pico_kw": 22.61,
        "pico_kva": 28.79,
        "fp": 0.93,
        "demanda_kw": 7.15,
        "consumo_kwh": 45.95,
        "consumo_dias": 1,
        "padrao_atual": 150,
        "padrao_proposto": 250,
        "ev_kw": 60,
        "flags": ["Amostra 1 dia", "FP OK", "Desequilíbrio corrente"],
    },
    {
        "id": "muffatao-toledo",
        "title": "Muffatão Toledo",
        "cliente": "Muffatão Toledo",
        "cidade": "Toledo - PR",
        "data": "26/05/2026",
        "arquivo":           "Relatorio_Analise_Carga_Muffatao_Toledo.html",
        "arquivo_eletrico":  "Relatorio_Eletrico_Muffatao_Toledo.html",
        "arquivo_carregador":"Relatorio_Carregador_Muffatao_Toledo.html",
        "status": "warn",
        "status_label": "Atenção",
        "pico_kw": 24.92,
        "pico_kva": 31.89,
        "fp": 0.85,
        "demanda_kw": 29.71,
        "consumo_kwh": 178.25,
        "consumo_dias": 6,
        "padrao_atual": 200,
        "padrao_proposto": 250,
        "ev_kw": 60,
        "flags": ["FP abaixo de 0,92", "Desequilíbrio corrente", "Desequilíbrio tensão", "127/220 V"],
    }
]

# ─── HELPERS ─────────────────────────────────────────────────────────────────

STATUS_COLOR = {"ok": "🟢", "warn": "🟡", "danger": "🔴"}
STATUS_BG    = {"ok": "#0E2A1B", "warn": "#2E2310", "danger": "#2E1714"}
STATUS_FG    = {"ok": "#7FE2A0", "warn": "#F2D77F",  "danger": "#FF8B7C"}

FLAG_CRIT_KW = ["baixo", "crítico", "desequilíbrio"]
FLAG_WARN_KW = ["elevad", "atenção"]


def flag_style(flag: str) -> str:
    fl = flag.lower()
    if any(k in fl for k in FLAG_CRIT_KW):
        return "background:#2E1714;color:#FF8B7C;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600"
    if any(k in fl for k in FLAG_WARN_KW):
        return "background:#2E2310;color:#F2D77F;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600"
    return "background:#1F2A26;color:#8FA39A;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600"


def consumo_mensal(r: dict) -> float:
    return r["consumo_kwh"] / r["consumo_dias"] * 30 / 1000


def report_url(filename: str) -> str:
    if not RELATORIOS_BASE_URL:
        return ""
    return f"{RELATORIOS_BASE_URL.rstrip('/')}/{filename}"


# ─── PÁGINA ──────────────────────────────────────────────────────────────────

page_header(
    "⚡ Analisador de Carga",
    "Central de relatórios de medição por site — base para dimensionamento dos carregadores EV.",
)

# ── Métricas agregadas ────────────────────────────────────────────────────────
total_pico   = sum(r["pico_kw"] for r in RELATORIOS)
total_cons   = sum(consumo_mensal(r) for r in RELATORIOS)
total_ev_kw  = sum(r["ev_kw"] for r in RELATORIOS)
fp_medio     = sum(r["fp"] for r in RELATORIOS) / len(RELATORIOS) if RELATORIOS else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Sites analisados",      len(RELATORIOS))
c2.metric("Demanda total (pico)",  f"{total_pico:.1f} kW")
c3.metric("Consumo agregado/mês",  f"{total_cons:.1f} MWh")
c4.metric("Potência EV planejada", f"{total_ev_kw} kW")

st.markdown("---")

# ── Gráficos comparativos ────────────────────────────────────────────────────
section_title("Comparativo entre sites")
col_chart1, col_chart2 = st.columns(2)

with col_chart1:
    labels = [r["title"] for r in RELATORIOS]
    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="Pico ativa (kW)", x=labels, y=[r["pico_kw"] for r in RELATORIOS],
        marker_color="#0F3D2E", marker_line_color="#2EA85C", marker_line_width=1.5
    ))
    fig.add_trace(go.Bar(
        name="Demanda diária (kW)", x=labels, y=[r["demanda_kw"] for r in RELATORIOS],
        marker_color="#2EA85C"
    ))
    fig.update_layout(
        title="Demanda — Pico vs Diária",
        barmode="group", height=320,
        paper_bgcolor="#16221E", plot_bgcolor="#16221E",
        font_color="#E8EFEB", legend=dict(orientation="h", yanchor="bottom", y=1.02)
    )
    st.plotly_chart(fig, use_container_width=True)

with col_chart2:
    fp_colors = ["#2EA85C" if r["fp"] >= 0.92 else "#E55545" for r in RELATORIOS]
    fig2 = go.Figure(go.Bar(
        x=labels, y=[r["fp"] for r in RELATORIOS],
        marker_color=fp_colors, marker_line_width=0
    ))
    fig2.add_hline(y=0.92, line_dash="dash", line_color="#F2A93D",
                   annotation_text="Mín. NBR 0,92", annotation_position="bottom right")
    fig2.update_layout(
        title="Fator de Potência médio por site",
        height=320, yaxis=dict(range=[0, 1]),
        paper_bgcolor="#16221E", plot_bgcolor="#16221E",
        font_color="#E8EFEB"
    )
    st.plotly_chart(fig2, use_container_width=True)

st.markdown("---")

# ── Barra de ferramentas ──────────────────────────────────────────────────────
col_titulo, col_search = st.columns([3, 2])
with col_titulo:
    section_title("Relatórios")
with col_search:
    filtro = st.text_input("", placeholder="🔍  Buscar por cliente, cidade ou data...", label_visibility="collapsed")

# Filtragem
f = filtro.lower()
relatorios_filtrados = [
    r for r in RELATORIOS
    if not f or f in r["title"].lower() or f in r["cliente"].lower()
       or f in r["cidade"].lower() or f in r["data"]
]

if not relatorios_filtrados:
    st.info("Nenhum relatório encontrado para esse filtro.")
else:
    # Cards em grade de 2 colunas
    for i in range(0, len(relatorios_filtrados), 2):
        cols = st.columns(2)
        for j, col in enumerate(cols):
            if i + j >= len(relatorios_filtrados):
                break
            r = relatorios_filtrados[i + j]
            cm = consumo_mensal(r)

            with col:
                icon = STATUS_COLOR.get(r["status"], "⚪")
                with st.container(border=True):
                    # Cabeçalho
                    h1, h2 = st.columns([4, 1])
                    with h1:
                        st.markdown(f"**{r['title']}**")
                        st.caption(f"{r['cidade']} • {r['data']}")
                    with h2:
                        st.markdown(
                            f"<span style='background:{STATUS_BG[r['status']]};color:{STATUS_FG[r['status']]};"
                            f"border-radius:8px;padding:3px 10px;font-size:11px;font-weight:700'>"
                            f"{icon} {r['status_label']}</span>",
                            unsafe_allow_html=True
                        )

                    # Métricas do site
                    m1, m2, m3 = st.columns(3)
                    m1.metric("Pico",      f"{r['pico_kw']:.1f} kW")
                    m2.metric("FP médio",  f"{r['fp']:.2f} {'✓' if r['fp'] >= 0.92 else '↓'}")
                    m3.metric("Cons./mês", f"{cm:.1f} MWh")

                    # Flags de alerta
                    flags_html = " ".join(
                        f"<span style='{flag_style(fl)}'>{fl}</span>"
                        for fl in r["flags"]
                    )
                    st.markdown(flags_html, unsafe_allow_html=True)

                    # Rodapé
                    st.caption(f"Padrão {r['padrao_atual']} A → {r['padrao_proposto']} A  •  EV {r['ev_kw']} kW")

                    # Botões de relatório
                    if RELATORIOS_BASE_URL:
                        b1, b2, b3 = st.columns(3)
                        b1.link_button("📋 Completo",   report_url(r["arquivo"]),           use_container_width=True)
                        b2.link_button("⚡ Elétrico",   report_url(r["arquivo_eletrico"]),  use_container_width=True)
                        b3.link_button("🔌 Carregador", report_url(r["arquivo_carregador"]),use_container_width=True)
                    else:
                        st.info("Configure RELATORIOS_BASE_URL para habilitar os links dos relatórios.", icon="ℹ️")

st.markdown("---")
st.caption("P3 Energy • Medições DMI P1000R Black Box (Datalog ISSO Telecom)")
