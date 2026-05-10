"""
home_page.py — Visão Geral P3 Energy
=====================================
Dashboard principal inspirado na plataforma MOVE:
  • KPIs: carregadores, estações, ocupação, sustentabilidade
  • Mapa interativo dos pontos de carga
  • Log de atividade recente
  • Agenda Google Calendar (embed)
  • Métricas de período: kWh, receita, custo
"""
import datetime
import streamlit as st
from utils.p3_styles import inject, section_title
from utils.calendar_sync import get_upcoming_events


# ─── CONFIGURAÇÃO DE DADOS REAIS ────────────────────────────────────────────
# Quando integrar com OCPP/Supabase, substitua estes valores pela chamada à API.
# Por ora, preencha manualmente ou deixe zerado para mostrar estado limpo.

CARREGADORES_DADOS = [
    # Exemplo de estrutura:
    # {
    #   "id": "CHG-001",
    #   "nome": "Rio Beach EV",
    #   "local": "Rio de Janeiro - RJ",
    #   "lat": -22.9068,
    #   "lon": -43.1729,
    #   "status": "online",      # online | ocupado | offline
    #   "kw": 7,
    # },
]

ATIVIDADES_RECENTES = [
    # Exemplo de estrutura:
    # {
    #   "timestamp": "09/05/26 21:22",
    #   "estacao": "Rio Beach EV 7KW",
    #   "tipo": "inicio",        # inicio | fim | erro
    #   "usuario": "Rafael Dias da Cruz",
    # },
]

# Google Calendar — cole aqui o src do iframe do seu calendário Google.
# Como obter: Google Calendar → Configurações → "Integrar agenda" → copiar o link do iframe src
# Exemplo: https://calendar.google.com/calendar/embed?src=SEU_ID@gmail.com&...
GOOGLE_CALENDAR_SRC = ""  # ← cole o link aqui

# Metas de sustentabilidade (preencher com valores reais)
META_CO2_KG_MES = 0.0      # kg CO2 evitados / mês (meta)
META_ARVORES_MES = 0        # árvores equivalentes / mês (meta)


# ─── RENDER ─────────────────────────────────────────────────────────────────
def render_home():
    inject()

    # ── Header ───────────────────────────────────────────────────────────────
    hoje = datetime.date.today()
    inicio_mes = hoje.replace(day=1)

    col_titulo, col_periodo = st.columns([3, 2])
    with col_titulo:
        st.markdown(
            "<div style='display:flex;align-items:center;gap:14px;padding:6px 0'>"
            "<span style='font-size:30px;font-weight:900;color:#3FB66B;letter-spacing:-1px'>P3 Energy</span>"
            "<span style='font-size:15px;color:#8FA39A;font-weight:500;padding-top:4px'>· Visão Geral</span>"
            "</div>",
            unsafe_allow_html=True,
        )
    with col_periodo:
        pc1, pc2 = st.columns(2)
        data_ini = pc1.date_input("De", value=inicio_mes, label_visibility="collapsed")
        data_fim = pc2.date_input("Até", value=hoje,       label_visibility="collapsed")

    st.markdown("")

    # ── KPI Cards — linha 1 ───────────────────────────────────────────────────
    total        = len(CARREGADORES_DADOS)
    online       = sum(1 for c in CARREGADORES_DADOS if c.get("status") == "online")
    ocupado      = sum(1 for c in CARREGADORES_DADOS if c.get("status") == "ocupado")
    offline      = sum(1 for c in CARREGADORES_DADOS if c.get("status") == "offline")
    pct_ocup     = round(ocupado / total * 100) if total else 0
    n_atividades = len(ATIVIDADES_RECENTES)

    k1, k2, k3, k4 = st.columns(4)

    # Card Carregadores
    with k1:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px'>⚡ CARREGADORES</div>"
                f"<div style='display:flex;gap:20px;align-items:flex-end'>"
                f"  <div>"
                f"    <div style='font-size:36px;font-weight:800;color:#3FB66B;line-height:1'>{online}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:2px'>🟢 Online</div>"
                f"  </div>"
                f"  <div>"
                f"    <div style='font-size:36px;font-weight:800;color:#FFD66B;line-height:1'>{ocupado}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:2px'>🟡 Ocupados</div>"
                f"  </div>"
                f"  <div>"
                f"    <div style='font-size:36px;font-weight:800;color:#E55545;line-height:1'>{offline}</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:2px'>🔴 Offline</div>"
                f"  </div>"
                f"</div>",
                unsafe_allow_html=True,
            )

    # Card Estações
    with k2:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px'>📍 ESTAÇÕES</div>"
                f"<div style='font-size:46px;font-weight:800;color:#E55545;line-height:1'>{total}</div>"
                f"<div style='font-size:12px;color:#8FA39A;margin-top:6px'>Total de estações ativas</div>"
                f"<div style='font-size:11px;color:#8FA39A;margin-top:2px'>{n_atividades} atividades no período</div>",
                unsafe_allow_html=True,
            )

    # Card Ocupação
    with k3:
        cor_ocup = "#3FB66B" if pct_ocup < 50 else "#F2A93D" if pct_ocup < 80 else "#E55545"
        # Mini donut via SVG inline
        raio = 28
        circum = 2 * 3.14159 * raio
        dashoffset = circum * (1 - pct_ocup / 100)
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px'>🔄 OCUPAÇÃO</div>"
                "<div style='display:flex;align-items:center;gap:16px'>"
                f"  <svg width='70' height='70' viewBox='0 0 70 70'>"
                f"    <circle cx='35' cy='35' r='{raio}' fill='none' stroke='#2A3530' stroke-width='8'/>"
                f"    <circle cx='35' cy='35' r='{raio}' fill='none' stroke='{cor_ocup}' stroke-width='8'"
                f"      stroke-dasharray='{circum:.1f}' stroke-dashoffset='{dashoffset:.1f}'"
                f"      transform='rotate(-90 35 35)' stroke-linecap='round'/>"
                f"    <text x='35' y='40' text-anchor='middle' fill='{cor_ocup}' font-size='14' font-weight='bold'>{pct_ocup}%</text>"
                f"  </svg>"
                f"  <div>"
                f"    <div style='font-size:13px;color:#E8EFEB'>{ocupado} de {total} ocupados</div>"
                f"    <div style='font-size:11px;color:#8FA39A;margin-top:4px'>Agora</div>"
                f"  </div>"
                "</div>",
                unsafe_allow_html=True,
            )

    # Card Sustentabilidade
    with k4:
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px'>🌱 SUSTENTABILIDADE</div>"
                f"<div style='font-size:32px;font-weight:800;color:#3FB66B;line-height:1'>{META_CO2_KG_MES:,.0f} kg</div>"
                f"<div style='font-size:12px;color:#8FA39A;margin-top:4px'>CO₂ evitados no período</div>"
                f"<div style='font-size:11px;color:#8FA39A;margin-top:2px'>🌳 {META_ARVORES_MES} árvores equivalentes</div>",
                unsafe_allow_html=True,
            )

    st.markdown("")

    # ── Mapa + Log de Atividade | Métricas direita ─────────────────────────
    col_mapa, col_metricas = st.columns([3, 1])

    with col_mapa:
        # -- Mapa interativo --
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
                "<div style='background:#16221E;border:1px dashed #2A3530;border-radius:12px;"
                "height:280px;display:flex;flex-direction:column;align-items:center;"
                "justify-content:center;gap:10px'>"
                "<span style='font-size:36px'>🗺️</span>"
                "<span style='color:#8FA39A;font-size:14px'>Mapa disponível após cadastro dos carregadores</span>"
                "<span style='color:#2A3530;font-size:12px'>Adicione lat/lon em CARREGADORES_DADOS no home_page.py</span>"
                "</div>",
                unsafe_allow_html=True,
            )

        st.markdown("")

        # -- Log de atividade --
        section_title("📋 Atividade Recente")

        if ATIVIDADES_RECENTES:
            for a in ATIVIDADES_RECENTES[-8:][::-1]:  # últimas 8, mais recente primeiro
                cor  = "#3FB66B" if a["tipo"] == "inicio" else "#E55545" if a["tipo"] == "erro" else "#8FA39A"
                icone = "🟢" if a["tipo"] == "inicio" else "🔴" if a["tipo"] == "erro" else "⬛"
                st.markdown(
                    f"<div style='display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #2A3530'>"
                    f"  <span style='font-size:16px;flex-shrink:0'>{icone}</span>"
                    f"  <div style='flex:1'>"
                    f"    <span style='font-size:12px;color:#E8EFEB'>{a['timestamp']} — <b>{a['estacao']}</b></span><br>"
                    f"    <span style='font-size:11px;color:#8FA39A'>{a.get('usuario','')}</span>"
                    f"  </div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
        else:
            st.info("Nenhuma atividade registrada ainda. Os eventos aparecerão aqui em tempo real após integração OCPP.", icon="📡")

    with col_metricas:
        section_title("📊 Período")

        # kWh
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px'>⚡ kWh ENTREGUES</div>"
                "<div style='font-size:28px;font-weight:800;color:#FFD66B'>0,00</div>"
                "<div style='font-size:11px;color:#8FA39A'>Total no período</div>",
                unsafe_allow_html=True,
            )

        st.markdown("")

        # Custo
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px'>💡 CUSTO ESTIMADO</div>"
                "<div style='font-size:28px;font-weight:800;color:#E55545'>R$ 0,00</div>"
                "<div style='font-size:11px;color:#8FA39A'>Total no período</div>",
                unsafe_allow_html=True,
            )

        st.markdown("")

        # Receita
        with st.container(border=True):
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px'>💰 RECEITA ESTIMADA</div>"
                "<div style='font-size:28px;font-weight:800;color:#3FB66B'>R$ 0,00</div>"
                "<div style='font-size:11px;color:#8FA39A'>Total no período</div>",
                unsafe_allow_html=True,
            )

        st.markdown("")

        # Prospecção rápida
        with st.container(border=True):
            prospecoes = st.session_state.get("prospecoes", [])
            em_pros   = sum(1 for p in prospecoes if p.get("status") == "Em prospecção")
            contratos = sum(1 for p in prospecoes if p.get("status") == "Contrato assinado")
            st.markdown(
                "<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px'>🔍 PROSPECÇÃO</div>"
                f"<div style='font-size:22px;font-weight:800;color:#7FCCFF'>{em_pros}</div>"
                f"<div style='font-size:11px;color:#8FA39A'>Em prospecção</div>"
                f"<div style='font-size:18px;font-weight:800;color:#3FB66B;margin-top:8px'>{contratos}</div>"
                f"<div style='font-size:11px;color:#8FA39A'>Contratos assinados</div>",
                unsafe_allow_html=True,
            )

    st.markdown("---")

    # ── Agenda Google Calendar ────────────────────────────────────────────────
    section_title("📅 Agenda — P3 Energy")

    eventos = get_upcoming_events(n=8)

    if eventos:
        col_ag1, col_ag2 = st.columns(2)
        for idx, ev in enumerate(eventos):
            col = col_ag1 if idx % 2 == 0 else col_ag2
            with col:
                # Formata data/hora
                inicio = ev["start"]
                if ev["all_day"]:
                    data_str = inicio.strftime("%d/%m/%Y") if hasattr(inicio, "strftime") else str(inicio)
                    hora_str = "Dia todo"
                else:
                    data_str = inicio.strftime("%d/%m/%Y")
                    hora_str = inicio.strftime("%H:%M")

                # Dia da semana
                DIAS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]
                dia_semana = DIAS[inicio.weekday()] if hasattr(inicio, "weekday") else ""

                # Cor por dia da semana
                cor_dia = "#3FB66B" if dia_semana in ["Seg","Ter","Qua","Qui","Sex"] else "#FFD66B"

                local_html = (
                    f"<div style='font-size:11px;color:#8FA39A;margin-top:4px'>📍 {ev['location'][:50]}{'...' if len(ev['location'])>50 else ''}</div>"
                    if ev["location"] else ""
                )

                link_html = (
                    f"<a href='{ev['link']}' target='_blank' style='font-size:10px;color:#3FB66B;text-decoration:none'>Abrir no Google Calendar →</a>"
                    if ev["link"] else ""
                )

                with st.container(border=True):
                    st.markdown(
                        f"<div style='display:flex;gap:12px;align-items:flex-start'>"
                        f"  <div style='background:#2A3530;border-radius:8px;padding:6px 10px;text-align:center;min-width:48px;flex-shrink:0'>"
                        f"    <div style='font-size:10px;color:{cor_dia};font-weight:700;text-transform:uppercase'>{dia_semana}</div>"
                        f"    <div style='font-size:18px;font-weight:800;color:#E8EFEB;line-height:1.2'>{data_str[0:2]}</div>"
                        f"    <div style='font-size:10px;color:#8FA39A'>{data_str[3:5]}/{data_str[6:]}</div>"
                        f"  </div>"
                        f"  <div style='flex:1;min-width:0'>"
                        f"    <div style='font-size:13px;font-weight:700;color:#E8EFEB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>{ev['summary']}</div>"
                        f"    <div style='font-size:11px;color:{cor_dia};margin-top:2px'>🕐 {hora_str}</div>"
                        f"    {local_html}"
                        f"    <div style='margin-top:6px'>{link_html}</div>"
                        f"  </div>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
    else:
        col_cal, col_inst = st.columns([2, 1])
        with col_cal:
            st.warning(
                "**Google Calendar não conectado ainda.**\n\n"
                "Para ativar a agenda no app, o token OAuth precisa incluir o escopo de Calendar. "
                "Vá em **Integrações → Google Drive** e regenere o token incluindo:\n"
                "`https://www.googleapis.com/auth/calendar.readonly`",
                icon="📅",
            )
        with col_inst:
            st.info(
                "**Próximos passos:**\n\n"
                "• Conectar OCPP/MQTT\n"
                "• Integrar Supabase\n"
                "• Agente Instagram\n"
                "• Relatórios automáticos",
                icon="🚀",
            )

    st.markdown("---")
    st.caption(
        f"P3 Energy · Visão Geral · {hoje.strftime('%d/%m/%Y')} · "
        "Dados em tempo real disponíveis após integração OCPP/Supabase."
    )
