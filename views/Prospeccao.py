"""
Prospecção — pipeline de sites em prospecção e estudo
"""
import datetime

import streamlit as st

from utils.p3_styles import inject, page_header, section_title, badge

inject()

# ─── DADOS (substituir por Supabase futuramente) ──────────────────────────────
if "prospecoes" not in st.session_state:
    st.session_state["prospecoes"] = [
        {
            "nome": "Posto Shell — Ipanema",
            "cidade": "Rio de Janeiro - RJ",
            "contato": "Carlos Menezes",
            "telefone": "(21) 99999-0001",
            "fluxo_veiculos": "Alto",
            "padrao_atual": 150,
            "ev_kw": 60,
            "status": "Proposta enviada",
            "data_contato": "25/04/2026",
            "obs": "Cliente interessado, aguardando resposta sobre financiamento.",
        },
        {
            "nome": "Shopping Via Parque",
            "cidade": "Barra da Tijuca - RJ",
            "contato": "Gerência de Facilities",
            "telefone": "(21) 3333-4444",
            "fluxo_veiculos": "Muito alto",
            "padrao_atual": 200,
            "ev_kw": 60,
            "status": "Em prospecção",
            "data_contato": "05/05/2026",
            "obs": "Reunião agendada para 15/05.",
        },
        {
            "nome": "Posto Petrobras — Tijuca",
            "cidade": "Rio de Janeiro - RJ",
            "contato": "Roberto Lima",
            "telefone": "(21) 98888-7777",
            "fluxo_veiculos": "Médio",
            "padrao_atual": 100,
            "ev_kw": 60,
            "status": "Estudo elétrico",
            "data_contato": "01/05/2026",
            "obs": "Padrão precisa de upgrade para 150A antes da instalação.",
        },
        {
            "nome": "Condomínio Jardim Oceânico",
            "cidade": "Barra da Tijuca - RJ",
            "contato": "Síndico",
            "telefone": "(21) 97777-6666",
            "fluxo_veiculos": "Baixo",
            "padrao_atual": 150,
            "ev_kw": 22,
            "status": "Em prospecção",
            "data_contato": "08/05/2026",
            "obs": "Projeto residencial — carregadores modo 2 ou 3.",
        },
    ]

PIPELINE_STATUS = [
    "Em prospecção",
    "Estudo elétrico",
    "Proposta enviada",
    "Contrato assinado",
    "Em obra",
]

STATUS_KIND = {
    "Em prospecção":   "neutral",
    "Estudo elétrico": "info",
    "Proposta enviada":"warn",
    "Contrato assinado":"ok",
    "Em obra":         "ok",
}

FLUXO_COLOR = {
    "Muito alto": "#3FB66B",
    "Alto":       "#5BC882",
    "Médio":      "#F2A93D",
    "Baixo":      "#E55545",
}

# ─── PÁGINA ───────────────────────────────────────────────────────────────────
page_header(
    "🔍 Prospecção",
    "Pipeline de sites em estudo e negociação. Registre contatos e avance no funil.",
)

prospecoes = st.session_state["prospecoes"]

# ── Métricas do funil ────────────────────────────────────────────────────────
c1, c2, c3, c4, c5 = st.columns(5)
for i, status in enumerate(PIPELINE_STATUS):
    count = sum(1 for p in prospecoes if p["status"] == status)
    [c1, c2, c3, c4, c5][i].metric(status, count)

st.markdown("---")

# ── Filtro por status ────────────────────────────────────────────────────────
filtro_status = st.multiselect(
    "Filtrar por status",
    PIPELINE_STATUS,
    default=PIPELINE_STATUS,
    label_visibility="collapsed",
)

prospecoes_filtradas = [p for p in prospecoes if p["status"] in filtro_status]

# ── Cards de prospecção ──────────────────────────────────────────────────────
section_title(f"Sites ({len(prospecoes_filtradas)})")

for i in range(0, len(prospecoes_filtradas), 2):
    cols = st.columns(2)
    for j, col in enumerate(cols):
        if i + j >= len(prospecoes_filtradas):
            break
        p = prospecoes_filtradas[i + j]
        cor_fluxo = FLUXO_COLOR.get(p["fluxo_veiculos"], "#8FA39A")
        kind = STATUS_KIND.get(p["status"], "neutral")

        with col:
            with st.container(border=True):
                h1, h2 = st.columns([4, 2])
                with h1:
                    st.markdown(f"**{p['nome']}**")
                    st.caption(p["cidade"])
                with h2:
                    st.markdown(
                        badge(p["status"], kind),
                        unsafe_allow_html=True,
                    )

                m1, m2, m3 = st.columns(3)
                m1.markdown(
                    f"<div style='font-size:11px;color:var(--p3-muted)'>FLUXO</div>"
                    f"<div style='font-size:13px;font-weight:700;color:{cor_fluxo}'>{p['fluxo_veiculos']}</div>",
                    unsafe_allow_html=True,
                )
                m2.markdown(
                    f"<div style='font-size:11px;color:var(--p3-muted)'>PADRÃO</div>"
                    f"<div style='font-size:13px;font-weight:700;color:var(--p3-primary)'>{p['padrao_atual']} A</div>",
                    unsafe_allow_html=True,
                )
                m3.markdown(
                    f"<div style='font-size:11px;color:var(--p3-muted)'>EV</div>"
                    f"<div style='font-size:13px;font-weight:700;color:var(--p3-primary)'>{p['ev_kw']} kW</div>",
                    unsafe_allow_html=True,
                )

                st.markdown(
                    f"<p style='font-size:12px;color:var(--p3-muted);margin:8px 0 2px'>"
                    f"👤 {p['contato']} &nbsp;·&nbsp; 📞 {p['telefone']}</p>",
                    unsafe_allow_html=True,
                )
                if p["obs"]:
                    st.markdown(
                        f"<p style='font-size:12px;color:#E8EFEB;opacity:.8;margin:0'>{p['obs']}</p>",
                        unsafe_allow_html=True,
                    )
                st.caption(f"Primeiro contato: {p['data_contato']}")

st.markdown("---")

# ── Adicionar novo site ───────────────────────────────────────────────────────
section_title("Adicionar Site")

with st.form("form_prospeccao", clear_on_submit=True):
    col_a, col_b = st.columns(2)
    nome   = col_a.text_input("Nome do local *")
    cidade = col_b.text_input("Cidade - UF *")

    col_c, col_d = st.columns(2)
    contato  = col_c.text_input("Contato")
    telefone = col_d.text_input("Telefone")

    col_e, col_f, col_g = st.columns(3)
    fluxo         = col_e.selectbox("Fluxo de veículos", ["Muito alto","Alto","Médio","Baixo"])
    padrao_atual  = col_f.number_input("Padrão atual (A)", min_value=50, max_value=500, step=25, value=150)
    ev_kw         = col_g.selectbox("Potência EV (kW)", [22, 40, 60, 80, 120, 150])

    status_novo = st.selectbox("Status inicial", PIPELINE_STATUS)
    obs         = st.text_area("Observações", height=60)

    salvar = st.form_submit_button("➕ Adicionar ao Pipeline", type="primary", use_container_width=True)
    if salvar:
        if not nome or not cidade:
            st.error("Nome e cidade são obrigatórios.")
        else:
            novo = {
                "nome": nome, "cidade": cidade, "contato": contato,
                "telefone": telefone, "fluxo_veiculos": fluxo,
                "padrao_atual": padrao_atual, "ev_kw": ev_kw,
                "status": status_novo,
                "data_contato": datetime.date.today().strftime("%d/%m/%Y"),
                "obs": obs,
            }
            st.session_state["prospecoes"].append(novo)
            st.success(f"✅ '{nome}' adicionado ao pipeline!")
            st.rerun()

st.markdown("---")
st.caption("P3 Energy • Pipeline de prospecção. Conecte ao Supabase para persistência permanente.")
