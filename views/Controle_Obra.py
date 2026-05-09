"""
Controle de Obra — tarefas, prazos e datas por projeto
"""
import datetime

import streamlit as st

from utils.p3_styles import inject, page_header, section_title, badge

inject()

# ─── DADOS (substituir por Supabase futuramente) ──────────────────────────────
OBRAS = {
    "Rio Beach EV — Rio de Janeiro": {
        "status": "em_obra",
        "status_label": "Em Obra",
        "status_kind": "warn",
        "local": "Barra da Tijuca, Rio de Janeiro - RJ",
        "responsavel": "Eduardo",
        "inicio": datetime.date(2026, 3, 10),
        "previsao": datetime.date(2026, 6, 30),
        "carregadores": 2,
        "kw": 60,
        "parceiro": "Rio Beach",
        "tarefas": [
            {"desc": "Laudo elétrico aprovado",         "status": "ok",      "data": "10/03/2026"},
            {"desc": "Projeto executivo entregue",      "status": "ok",      "data": "20/03/2026"},
            {"desc": "Entrada CEMIG / ENEL protocolada","status": "ok",      "data": "05/04/2026"},
            {"desc": "Aprovação concessionária",        "status": "warn",    "data": "—"},
            {"desc": "Obras civis (fundação / nicho)",  "status": "pending", "data": "—"},
            {"desc": "Instalação dos carregadores",     "status": "pending", "data": "—"},
            {"desc": "Comissionamento e testes",        "status": "pending", "data": "—"},
            {"desc": "Entrega ao cliente",              "status": "pending", "data": "—"},
        ],
    },
    "Posto Malassise R.K. — Maringá": {
        "status": "em_estudo",
        "status_label": "Em Estudo",
        "status_kind": "info",
        "local": "Maringá - PR",
        "responsavel": "Eduardo",
        "inicio": datetime.date(2026, 4, 20),
        "previsao": datetime.date(2026, 8, 31),
        "carregadores": 1,
        "kw": 60,
        "parceiro": "Malassise Robert Koch",
        "tarefas": [
            {"desc": "Análise de carga (analisador)",   "status": "ok",      "data": "02/05/2026"},
            {"desc": "Relatório elétrico entregue",     "status": "ok",      "data": "02/05/2026"},
            {"desc": "Proposta comercial enviada",      "status": "warn",    "data": "—"},
            {"desc": "Assinatura do contrato",          "status": "pending", "data": "—"},
            {"desc": "Projeto executivo",               "status": "pending", "data": "—"},
        ],
    },
}

STATUS_TASK = {
    "ok":      ("🟢", "ok"),
    "warn":    ("🟡", "warn"),
    "danger":  ("🔴", "danger"),
    "pending": ("⚪", "neutral"),
}

# ─── PÁGINA ───────────────────────────────────────────────────────────────────
page_header(
    "📋 Controle de Obra",
    "Tarefas, prazos e marcos por projeto. Atualize conforme o andamento da obra.",
)

obra_sel = st.selectbox("Selecione a obra", list(OBRAS.keys()), label_visibility="collapsed")
obra = OBRAS[obra_sel]

# ── Resumo da obra ────────────────────────────────────────────────────────────
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Status",         obra["status_label"])
c2.metric("Responsável",    obra["responsavel"])
c3.metric("Carregadores",   f"{obra['carregadores']} × {obra['kw']} kW")
c4.metric("Início",         obra["inicio"].strftime("%d/%m/%Y"))
c5.metric("Previsão entrega", obra["previsao"].strftime("%d/%m/%Y"))

dias_restantes = (obra["previsao"] - datetime.date.today()).days
if dias_restantes < 0:
    st.error(f"⚠️ Obra com {abs(dias_restantes)} dias de atraso em relação à previsão inicial.")
elif dias_restantes <= 30:
    st.warning(f"⏳ Entrega em {dias_restantes} dias.")
else:
    st.success(f"✅ {dias_restantes} dias até a previsão de entrega.")

st.markdown("---")

# ── Tarefas ───────────────────────────────────────────────────────────────────
section_title("Tarefas e Marcos")

tarefas = obra["tarefas"]
concluidas = sum(1 for t in tarefas if t["status"] == "ok")
st.progress(concluidas / len(tarefas), text=f"{concluidas}/{len(tarefas)} tarefas concluídas")
st.markdown("")

for tarefa in tarefas:
    icone, kind = STATUS_TASK[tarefa["status"]]
    col_a, col_b, col_c = st.columns([0.5, 5, 1.5])
    col_a.markdown(f"<div style='font-size:20px;padding-top:4px'>{icone}</div>", unsafe_allow_html=True)
    col_b.markdown(
        f"<span style='font-size:14px;color:var(--p3-text)'>{tarefa['desc']}</span>",
        unsafe_allow_html=True,
    )
    col_c.markdown(
        f"<span style='font-size:12px;color:var(--p3-muted)'>{tarefa['data']}</span>",
        unsafe_allow_html=True,
    )

st.markdown("---")

# ── Adicionar tarefa (placeholder) ────────────────────────────────────────────
section_title("Adicionar Tarefa")

with st.form("form_tarefa"):
    col_d, col_e, col_f = st.columns([4, 2, 1])
    desc_nova   = col_d.text_input("Descrição da tarefa")
    data_nova   = col_e.date_input("Prazo previsto", value=datetime.date.today())
    status_novo = col_f.selectbox("Status", ["pending", "warn", "ok", "danger"])
    submitted = st.form_submit_button("➕ Adicionar Tarefa", type="primary", use_container_width=True)
    if submitted and desc_nova:
        st.success(f"Tarefa '{desc_nova}' adicionada! (Conecte ao Supabase para persistir)")

st.markdown("---")
st.caption(f"P3 Energy • Parceiro: {obra['parceiro']} • {obra['local']}")
