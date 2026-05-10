"""
home_page.py — Visão Geral P3 Energy
=====================================
Layout repaginado: KPIs em linha, métricas em row, mapa full-width, log full-width.
"""
import datetime
import streamlit as st
from utils.p3_styles import inject, section_title
from utils.calendar_sync import get_upcoming_events


# ─── CONFIGURAÇÃO DE DADOS REAIS ────────────────────────────────────────────
CARREGADORES_DADOS = [
    # {
    #   "id": "CHG-001", "nome": "Rio Beach EV", "local": "Rio de Janeiro - RJ",
    #   "lat": -22.9068, "lon": -43.1729,
    #   "status": "online",   # online | ocupado | offline
    #   "kw": 7,
    # },
]

ATIVIDADES_RECENTES = [
    # {
    #   "timestamp": "09/05/26 21:22", "estacao": "Rio Beach EV 7KW",
    #   "tipo": "inicio",   # inicio | fim | erro
    #   "usuario": "Rafael Dias da Cruz",
    # },
]

GOOGLE_CALENDAR_SRC = ""   # ← cole o src do iframe do Google Calendar


# ─── RENDER ─────────────────────────────────────────────────────────────────
def render_home():
    inject()

    # ── Header ───────────────────────────────────────────────────────────────
    hoje        = datetime.date.today()
    inicio_mes  = hoje.replace(day=1)

    col_titulo, col_periodo = st.columns([3, 2])
    with col_titulo:
        st.markdown(
            "<div style='display:flex;align-items:center;gap:14px;padding:6px 0'>"
            "<span style='font-size:32px;font-weight:900;color:#3FB66B;letter-spacing:-1px'>P3 Energy</span>"
            "<span style='font-size:15px;color:#8FA39A;font-weight:500;padding-top:6px'>· Visão Geral</span>"
            "</div>",
            unsafe_allow_html=True,
        )
    with col_periodo:
        pc1, pc2 = st.columns(2)
        data_ini = pc1.date_input("De",  value=inicio_mes, label_visibility="collapsed")
        data_fim = pc2.date_input("Até", value=hoje,       label_visibility="collapsed")

    st.markdown("<div style='margin-bottom:10px'></div>", unsafe_allow_html=True)

    # ── Linha 1 — KPI Carregadores (3 colunas largas) ────────────────────────
    total    = len(CARREGADORES_DADOS)
    online   = sum(1 for c in CARREGADORES_DADOS if c.get("status") == "online")
    ocupado  = sum(1 for c in CARREGADORES_DADOS if c.get("status") == "ocupado")
    offline  = sum(1 for c in CARREGADORES_DADOS if c.get("status") == "offline")
    pct_ocup = round(ocupado / total * 100) if total else 0
    n_ativ   = len(ATIVIDADES_RECENTES)

    k1, k2, k3 = st.columns(3, gap="medium")

    # Card Carregadores
    with k1:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;"
                "letter-spacing:1px;margin-bottom:14px'>⚡ CARREGADORES</div>"
                "<div style='display:flex;gap:28px;align-items:flex-end'>"
                f"  <div style='text-align:center'>"
                f"    <div style='font-size:44px;font-weight:800;color:#3FB66B;line-height:1'>{online}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:4px'>🟢 Online</div>"
                f"  </div>"
                f"  <div style='text-align:center'>"
                f"    <div style='font-size:44px;font-weight:800;color:#FFD66B;line-height:1'>{ocupado}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:4px'>🟡 Ocupados</div>"
                f"  </div>"
                f"  <div style='text-align:center'>"
                f"    <div style='font-size:44px;font-weight:800;color:#E55545;line-height:1'>{offline}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:4px'>🔴 Offline</div>"
                f"  </div>"
                f"</div>",
                unsafe_allow_html=True,
            )

    # Card Estações
    with k2:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;"
                "letter-spacing:1px;margin-bottom:14px'>📍 ESTAÇÕES</div>"
                f"<div style='font-size:56px;font-weight:800;color:#E55545;line-height:1'>{total}</div>"
                f"<div style='font-size:12px;color:#8FA39A;margin-top:8px'>Total de estações ativas</div>"
                f"<div style='font-size:11px;color:#8FA39A;margin-top:2px'>{n_ativ} atividades no período</div>",
                unsafe_allow_html=True,
            )

    # Card Ocupação
    with k3:
        cor_ocup  = "#3FB66B" if pct_ocup < 50 else "#F2A93D" if pct_ocup < 80 else "#E55545"
        raio      = 32
        circum    = 2 * 3.14159 * raio
        dashoffset = circum * (1 - pct_ocup / 100)
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;"
                "letter-spacing:1px;margin-bottom:12px'>🔄 OCUPAÇÃO</div>"
                "<div style='display:flex;align-items:center;gap:20px'>"
                f"  <svg width='80' height='80' viewBox='0 0 80 80'>"
                f"    <circle cx='40' cy='40' r='{raio}' fill='none' stroke='#2A3530' stroke-width='9'/>"
                f"    <circle cx='40' cy='40' r='{raio}' fill='none' stroke='{cor_ocup}' stroke-width='9'"
                f"      stroke-dasharray='{circum:.1f}' stroke-dashoffset='{dashoffset:.1f}'"
                f"      transform='rotate(-90 40 40)' stroke-linecap='round'/>"
                f"    <text x='40' y='46' text-anchor='middle' fill='{cor_ocup}' font-size='15' font-weight='bold'>{pct_ocup}%</text>"
                f"  </svg>"
                f"  <div>"
                f"    <div style='font-size:15px;font-weight:600;color:#E8EFEB'>{ocupado} de {total} ocupados</div>"
                f"    <div style='font-size:12px;color:#8FA39A;margin-top:6px'>Agora</div>"
                f"  </div>"
                "</div>",
                unsafe_allow_html=True,
            )

    st.markdown("<div style='margin-bottom:6px'></div>", unsafe_allow_html=True)

    # ── Linha 2 — Métricas em row (4 colunas) ────────────────────────────────
    m1, m2, m3, m4 = st.columns(4, gap="medium")

    with m1:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;"
                "letter-spacing:1px;margin-bottom:8px'>⚡ kWh ENTREGUES</div>"
                "<div style='font-size:32px;font-weight:800;color:#FFD66B;line-height:1'>0,00</div>"
                "<div style='font-size:11px;color:#8FA39A;margin-top:6px'>Total no período</div>",
                unsafe_allow_html=True,
            )

    with m2:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;"
                "letter-spacing:1px;margin-bottom:8px'>💡 CUSTO ESTIMADO</div>"
                "<div style='font-size:32px;font-weight:800;color:#E55545;line-height:1'>R$ 0,00</div>"
                "<div style='font-size:11px;color:#8FA39A;margin-top:6px'>Total no período</div>",
                unsafe_allow_html=True,
            )

    with m3:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;"
                "letter-spacing:1px;margin-bottom:8px'>💰 RECEITA ESTIMADA</div>"
                "<div style='font-size:32px;font-weight:800;color:#3FB66B;line-height:1'>R$ 0,00</div>"
                "<div style='font-size:11px;color:#8FA39A;margin-top:6px'>Total no período</div>",
                unsafe_allow_html=True,
            )

    with m4:
        prospecoes = st.session_state.get("prospecoes", [])
        em_pros    = sum(1 for p in prospecoes if p.get("status") == "Em prospecção")
        contratos  = sum(1 for p in prospecoes if p.get("status") == "Contrato assinado")
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;"
                "letter-spacing:1px;margin-bottom:8px'>🔍 PROSPECÇÃO</div>"
                f"<div style='display:flex;gap:20px;align-items:flex-end'>"
                f"  <div>"
                f"    <div style='font-size:32px;font-weight:800;color:#7FCCFF;line-height:1'>{em_pros}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:4px'>Em prosp.</div>"
                f"  </div>"
                f"  <div>"
                f"    <div style='font-size:32px;font-weight:800;color:#3FB66B;line-height:1'>{contratos}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:4px'>Contratos</div>"
                f"  </div>"
                f"</div>",
                unsafe_allow_html=True,
            )

    st.markdown("<div style='margin-bottom:10px'></div>", unsafe_allow_html=True)

    # ── Linha 3 — Mapa full-width ─────────────────────────────────────────────
    section_title("🗺️ Mapa dos Carregadores")

    if CARREGADORES_DADOS:
        import pandas as pd
        df_map = pd.DataFrame([
            {"lat": c["lat"], "lon": c["lon"], "nome": c["nome"]}
            for c in CARREGADORES_DADOS
            if "lat" in c and "lon" in c
        ])
        if not df_map.empty:
            st.map(df_map, zoom=10, use_container_width=True)
    else:
        st.markdown(
            "<div style='background:#16221E;border:1px dashed #2A3530;border-radius:14px;"
            "height:320px;display:flex;flex-direction:column;align-items:center;"
            "justify-content:center;gap:12px'>"
            "<span style='font-size:48px'>🗺️</span>"
            "<span style='color:#8FA39A;font-size:15px'>Mapa disponível após cadastro dos carregadores</span>"
            "<span style='color:#3A4E48;font-size:12px'>Adicione lat/lon em CARREGADORES_DADOS no home_page.py</span>"
            "</div>",
            unsafe_allow_html=True,
        )

    st.markdown("<div style='margin-bottom:10px'></div>", unsafe_allow_html=True)

    # ── Linha 4 — Log de Atividade full-width ────────────────────────────────
    section_title("📋 Atividade Recente")

    if ATIVIDADES_RECENTES:
        # Exibe em 2 colunas para aproveitar largura
        col_a1, col_a2 = st.columns(2, gap="medium")
        for idx, a in enumerate(ATIVIDADES_RECENTES[-10:][::-1]):
            col = col_a1 if idx % 2 == 0 else col_a2
            cor   = "#3FB66B" if a["tipo"] == "inicio" else "#E55545" if a["tipo"] == "erro" else "#8FA39A"
            icone = "🟢" if a["tipo"] == "inicio" else "🔴" if a["tipo"] == "erro" else "⬛"
            with col:
                st.markdown(
                    f"<div style='display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid #2A3530'>"
                    f"  <span style='font-size:16px;flex-shrink:0'>{icone}</span>"
                    f"  <div style='flex:1'>"
                    f"    <span style='font-size:12px;color:#E8EFEB'>{a['timestamp']} — <b>{a['estacao']}</b></span><br>"
                    f"    <span style='font-size:11px;color:#8FA39A'>{a.get('usuario','')}</span>"
                    f"  </div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
    else:
        st.info(
            "Nenhuma atividade registrada ainda. Os eventos aparecerão aqui após integração OCPP.",
            icon="📡",
        )

    st.markdown("---")

    # ── Linha 5 — Agenda Google Calendar ─────────────────────────────────────
    section_title("📅 Próximos Compromissos")

    eventos = get_upcoming_events(n=6)

    if eventos:
        cols_ag = st.columns(3, gap="medium")
        for idx, ev in enumerate(eventos):
            col = cols_ag[idx % 3]
            inicio = ev["start"]
            if ev["all_day"]:
                data_str = inicio.strftime("%d/%m/%Y") if hasattr(inicio, "strftime") else str(inicio)
                hora_str = "Dia todo"
            else:
                data_str = inicio.strftime("%d/%m/%Y")
                hora_str = inicio.strftime("%H:%M")

            DIAS     = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]
            dia_sem  = DIAS[inicio.weekday()] if hasattr(inicio, "weekday") else ""
            cor_dia  = "#3FB66B" if dia_sem in ["Seg","Ter","Qua","Qui","Sex"] else "#FFD66B"
            loc_html = (
                f"<div style='font-size:11px;color:#8FA39A;margin-top:4px'>📍 {ev['location'][:40]}{'…' if len(ev['location'])>40 else ''}</div>"
                if ev.get("location") else ""
            )
            lnk_html = (
                f"<a href='{ev['link']}' target='_blank' style='font-size:10px;color:#3FB66B;text-decoration:none'>Abrir no Calendar →</a>"
                if ev.get("link") else ""
            )
            with col:
                with st.container(border=True):
                    st.markdown(
                        f"<div style='display:flex;gap:12px;align-items:flex-start'>"
                        f"  <div style='background:#2A3530;border-radius:8px;padding:6px 10px;text-align:center;min-width:50px;flex-shrink:0'>"
                        f"    <div style='font-size:10px;color:{cor_dia};font-weight:700;text-transform:uppercase'>{dia_sem}</div>"
                        f"    <div style='font-size:22px;font-weight:800;color:#E8EFEB;line-height:1.1'>{data_str[:2]}</div>"
                        f"    <div style='font-size:10px;color:#8FA39A'>{data_str[3:5]}/{data_str[6:]}</div>"
                        f"  </div>"
                        f"  <div style='flex:1;min-width:0'>"
                        f"    <div style='font-size:13px;font-weight:700;color:#E8EFEB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>{ev['summary']}</div>"
                        f"    <div style='font-size:11px;color:{cor_dia};margin-top:3px'>🕐 {hora_str}</div>"
                        f"    {loc_html}"
                        f"    <div style='margin-top:6px'>{lnk_html}</div>"
                        f"  </div>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
    else:
        col_w, col_i = st.columns([2, 1], gap="medium")
        with col_w:
            st.warning(
                "**Google Calendar não conectado.**  \n"
                "Vá em **Integrações → Google Drive** e regenere o token incluindo o escopo de Calendar.",
                icon="📅",
            )
        with col_i:
            st.info(
                "**Próximos passos:**\n\n"
                "• Conectar OCPP/MQTT\n"
                "• Integrar Supabase\n"
                "• Relatórios automáticos",
                icon="🚀",
            )

    st.markdown("---")
    st.caption(
        f"P3 Energy · Visão Geral · {hoje.strftime('%d/%m/%Y')} · "
        "Dados em tempo real após integração OCPP/Supabase."
    )
