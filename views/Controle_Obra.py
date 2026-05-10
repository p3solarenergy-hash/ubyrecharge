"""
Controle de Obra — tarefas, prazos e datas por projeto
"""
import datetime

import streamlit as st

from utils.p3_styles import inject, page_header, section_title, badge

inject()

# ─── DADOS (substituir por Supabase futuramente) ──────────────────────────────
# ─── ADICIONE SEUS PROJETOS AQUI ─────────────────────────────────────────────
# Exemplo de estrutura para cada obra:
# "Nome do Projeto — Cidade": {
#     "status": "em_estudo" | "em_obra" | "concluido",
#     "status_label": "Em Estudo" | "Em Obra" | "Concluído",
#     "status_kind": "info" | "warn" | "ok",
#     "local": "Cidade - UF",
#     "responsavel": "Nome",
#     "inicio": datetime.date(AAAA, MM, DD),
#     "previsao": datetime.date(AAAA, MM, DD),
#     "carregadores": N,
#     "kw": 60,
#     "parceiro": "Nome do parceiro",
#     "tarefas": [],   ← adicione as tarefas reais aqui
# }
OBRAS = {}

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

if not OBRAS:
    st.info("Nenhum projeto cadastrado ainda. Adicione projetos no dicionário OBRAS no código.", icon="📋")
else:
    obra_sel = st.selectbox("Selecione a obra", list(OBRAS.keys()), label_visibility="collapsed")
    obra = OBRAS[obra_sel]

    # ── Resumo da obra ────────────────────────────────────────────────────────
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Status",           obra["status_label"])
    c2.metric("Responsável",      obra["responsavel"])
    c3.metric("Carregadores",     f"{obra['carregadores']} × {obra['kw']} kW")
    c4.metric("Início",           obra["inicio"].strftime("%d/%m/%Y"))
    c5.metric("Previsão entrega", obra["previsao"].strftime("%d/%m/%Y"))

    dias_restantes = (obra["previsao"] - datetime.date.today()).days
    if dias_restantes < 0:
        st.error(f"⚠️ Obra com {abs(dias_restantes)} dias de atraso em relação à previsão inicial.")
    elif dias_restantes <= 30:
        st.warning(f"⏳ Entrega em {dias_restantes} dias.")
    else:
        st.success(f"✅ {dias_restantes} dias até a previsão de entrega.")

    st.markdown("---")

    # ── Tarefas ───────────────────────────────────────────────────────────────
    section_title("Tarefas e Marcos")

    tarefas = obra["tarefas"]
    if not tarefas:
        st.info("Nenhuma tarefa cadastrada para esta obra ainda.")
    else:
        concluidas = sum(1 for t in tarefas if t["status"] == "ok")
        st.progress(concluidas / len(tarefas), text=f"{concluidas}/{len(tarefas)} tarefas concluídas")
        st.markdown("")
        for tarefa in tarefas:
            icone, kind = STATUS_TASK[tarefa["status"]]
            col_a, col_b, col_c = st.columns([0.5, 5, 1.5])
            col_a.markdown(f"<div style='font-size:20px;padding-top:4px'>{icone}</div>", unsafe_allow_html=True)
            col_b.markdown(f"<span style='font-size:14px;color:var(--p3-text)'>{tarefa['desc']}</span>", unsafe_allow_html=True)
            col_c.markdown(f"<span style='font-size:12px;color:var(--p3-muted)'>{tarefa['data']}</span>", unsafe_allow_html=True)

    st.markdown("---")
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
