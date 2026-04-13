import os
import sys

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.crm_store import (
    AREA_STATUS_OPTIONS,
    CRM_AREAS,
    PRIORITIES,
    delete_crm_item,
    get_crm_item,
    list_crm_items,
    upload_crm_document,
    upsert_crm_item,
)
from utils.manager_auth import logout_manager, render_manager_login


def _empty_item() -> dict:
    return {
        "title": "",
        "company": "",
        "project": "",
        "area": "Negociação",
        "status": "Em negociação",
        "priority": "Média",
        "owner": "",
        "city": "",
        "expected_close": "",
        "next_step": "",
        "notes": "",
        "documents": [],
    }


st.set_page_config(page_title="CRM de Implantação", page_icon="📂", layout="wide")
st.title("📂 CRM de Implantação")
st.caption("Controle de prospecção, negociação, documentação e obra com anexos no Google Drive.")

if not render_manager_login("CRM de Implantação"):
    st.stop()

top_left, top_right = st.columns([4, 1])
with top_right:
    if st.button("Sair da área do gestor"):
        logout_manager()
        st.rerun()

items = list_crm_items()
counts_by_area = {area: len([item for item in items if item.get("area") == area]) for area in CRM_AREAS}

metric_cols = st.columns(5)
metric_cols[0].metric("Registros", len(items))
metric_cols[1].metric("Prospecção", counts_by_area["Prospecção"])
metric_cols[2].metric("Negociação", counts_by_area["Negociação"])
metric_cols[3].metric("Documentação", counts_by_area["Documentação"])
metric_cols[4].metric("Obra", counts_by_area["Obra"])

st.markdown("---")

left_col, right_col = st.columns([1.1, 1.5])

with left_col:
    st.markdown("### Novo registro")
    with st.form("crm_new_item"):
        title = st.text_input("Título")
        company = st.text_input("Empresa / cliente")
        project = st.text_input("Projeto relacionado")
        area = st.selectbox("Área", CRM_AREAS, index=1)
        status = st.selectbox("Status", AREA_STATUS_OPTIONS[area], index=0)
        priority = st.selectbox("Prioridade", PRIORITIES, index=1)
        owner = st.text_input("Responsável")
        city = st.text_input("Cidade")
        expected_close = st.text_input("Prazo / data-chave", placeholder="Ex.: 30/04/2026")
        next_step = st.text_input("Próximo passo")
        notes = st.text_area("Observações")
        submitted = st.form_submit_button("Salvar registro", type="primary", use_container_width=True)

    if submitted:
        if not title.strip():
            st.error("Informe pelo menos um título para o registro.")
        else:
            saved = upsert_crm_item(
                {
                    "title": title,
                    "company": company,
                    "project": project,
                    "area": area,
                    "status": status,
                    "priority": priority,
                    "owner": owner,
                    "city": city,
                    "expected_close": expected_close,
                    "next_step": next_step,
                    "notes": notes,
                }
            )
            st.success(f"Registro salvo: {saved['title']}")
            st.rerun()

    st.markdown("---")
    st.markdown("### Pipeline por área")
    for area in CRM_AREAS:
        with st.expander(f"{area} ({counts_by_area[area]})", expanded=area == "Negociação"):
            area_items = [item for item in items if item.get("area") == area]
            if not area_items:
                st.caption("Sem registros nesta área.")
            for item in area_items:
                st.markdown(
                    f"- **{item.get('title', 'Sem título')}**  \n"
                    f"  {item.get('status', 'Sem status')} | {item.get('company', 'Sem empresa')} | {item.get('owner', 'Sem responsável')}"
                )

with right_col:
    st.markdown("### Detalhe e documentação")
    if not items:
        st.info("Ainda não há registros. Crie o primeiro no painel ao lado.")
    else:
        selected_id = st.selectbox(
            "Selecione um registro",
            options=[item["id"] for item in items],
            format_func=lambda item_id: next(
                (
                    f"{item.get('title', 'Sem título')} - {item.get('company', 'Sem empresa')}"
                    for item in items
                    if item.get("id") == item_id
                ),
                item_id,
            ),
        )
        selected = get_crm_item(selected_id) or _empty_item()

        with st.form("crm_edit_item"):
            title = st.text_input("Título", value=selected.get("title", ""))
            company = st.text_input("Empresa / cliente", value=selected.get("company", ""))
            project = st.text_input("Projeto relacionado", value=selected.get("project", ""))
            area = st.selectbox("Área", CRM_AREAS, index=CRM_AREAS.index(selected.get("area", "Negociação")))
            current_statuses = AREA_STATUS_OPTIONS[area]
            current_status = selected.get("status", current_statuses[0])
            if current_status not in current_statuses:
                current_status = current_statuses[0]
            status = st.selectbox("Status", current_statuses, index=current_statuses.index(current_status))
            priority = st.selectbox("Prioridade", PRIORITIES, index=PRIORITIES.index(selected.get("priority", "Média")))
            owner = st.text_input("Responsável", value=selected.get("owner", ""))
            city = st.text_input("Cidade", value=selected.get("city", ""))
            expected_close = st.text_input("Prazo / data-chave", value=selected.get("expected_close", ""))
            next_step = st.text_input("Próximo passo", value=selected.get("next_step", ""))
            notes = st.text_area("Observações", value=selected.get("notes", ""))
            save_changes = st.form_submit_button("Atualizar registro", type="primary")

        if save_changes:
            updated = upsert_crm_item(
                {
                    **selected,
                    "title": title,
                    "company": company,
                    "project": project,
                    "area": area,
                    "status": status,
                    "priority": priority,
                    "owner": owner,
                    "city": city,
                    "expected_close": expected_close,
                    "next_step": next_step,
                    "notes": notes,
                }
            )
            st.success(f"Registro atualizado: {updated['title']}")
            st.rerun()

        delete_col, info_col = st.columns([1, 3])
        with delete_col:
            if st.button("Excluir registro", type="secondary", use_container_width=True):
                delete_crm_item(selected_id)
                st.success("Registro removido.")
                st.rerun()
        with info_col:
            st.caption(
                f"Criado em {selected.get('created_at', '—')} | Atualizado em {selected.get('updated_at', '—')}"
            )

        st.markdown("---")
        st.markdown("#### Documentos")
        uploaded_file = st.file_uploader(
            "Anexar documento",
            key=f"file-{selected_id}",
            accept_multiple_files=False,
            help="Ao anexar aqui, o arquivo sobe para o Google Drive e fica vinculado ao registro.",
        )
        if uploaded_file is not None:
            if st.button("Enviar anexo para o Drive", key=f"upload-{selected_id}", use_container_width=True):
                try:
                    document = upload_crm_document(selected, uploaded_file)
                    updated_docs = (selected.get("documents") or []) + [document]
                    upsert_crm_item({**selected, "documents": updated_docs})
                    st.success(f"Documento enviado: {document['name']}")
                    st.rerun()
                except Exception as exc:
                    st.error(f"Não foi possível enviar o documento: {exc}")

        documents = selected.get("documents") or []
        if not documents:
            st.info("Nenhum documento anexado ainda.")
        else:
            for document in documents:
                link = document.get("url", "")
                if link:
                    st.markdown(f"- [{document.get('name', 'Documento')}]({link})")
                else:
                    st.markdown(f"- {document.get('name', 'Documento')}")
