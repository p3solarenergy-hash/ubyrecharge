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
    upload_crm_documents,
    upsert_crm_item,
)
from utils.excel_reader import get_all_projects
from utils.manager_auth import logout_manager, render_manager_login

NEW_FORM_DEFAULTS = {
    "crm_new_title": "",
    "crm_new_company": "",
    "crm_new_project": "",
    "crm_new_area": "Negociação",
    "crm_new_status": AREA_STATUS_OPTIONS["Negociação"][0],
    "crm_new_priority": "Média",
    "crm_new_owner": "",
    "crm_new_city": "",
    "crm_new_expected_close": "",
    "crm_new_next_step": "",
    "crm_new_notes": "",
}


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


def _project_options() -> list[str]:
    project_names = []
    for relative_path in get_all_projects():
        name = os.path.splitext(os.path.basename(relative_path))[0].strip()
        if name:
            project_names.append(name)
    return [""] + sorted(set(project_names))


def _ensure_new_form_defaults():
    for key, value in NEW_FORM_DEFAULTS.items():
        st.session_state.setdefault(key, value)


def _reset_new_form():
    for key, value in NEW_FORM_DEFAULTS.items():
        st.session_state[key] = value


def _status_index(area: str, status: str) -> int:
    options = AREA_STATUS_OPTIONS.get(area, [])
    if not options:
        return 0
    return options.index(status) if status in options else 0


st.set_page_config(page_title="CRM de Implantação", page_icon="📂", layout="wide")
st.title("📂 CRM de Implantação")
st.caption("Controle de prospecção, negociação, documentação e obra com anexos no Google Drive.")

if not render_manager_login("CRM de Implantação"):
    st.stop()

project_options = _project_options()
_ensure_new_form_defaults()

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

    new_area = st.session_state.get("crm_new_area", "Negociação")
    new_status_options = AREA_STATUS_OPTIONS.get(new_area, AREA_STATUS_OPTIONS["Negociação"])
    if st.session_state.get("crm_new_status") not in new_status_options:
        st.session_state["crm_new_status"] = new_status_options[0]

    with st.form("crm_new_item"):
        title = st.text_input("Título", key="crm_new_title")
        company = st.text_input("Empresa / cliente", key="crm_new_company")
        project = st.selectbox(
            "Projeto relacionado",
            options=project_options,
            key="crm_new_project",
            help="Escolha um projeto já importado no app ou deixe em branco.",
        )
        area = st.selectbox("Área", CRM_AREAS, key="crm_new_area")
        status_options = AREA_STATUS_OPTIONS.get(area, AREA_STATUS_OPTIONS["Negociação"])
        if st.session_state.get("crm_new_status") not in status_options:
            st.session_state["crm_new_status"] = status_options[0]
        status = st.selectbox("Status", status_options, key="crm_new_status")
        priority = st.selectbox("Prioridade", PRIORITIES, key="crm_new_priority")
        owner = st.text_input("Responsável", key="crm_new_owner")
        city = st.text_input("Cidade", key="crm_new_city")
        expected_close = st.text_input("Prazo / data-chave", placeholder="Ex.: 30/04/2026", key="crm_new_expected_close")
        next_step = st.text_input("Próximo passo", key="crm_new_next_step")
        notes = st.text_area("Observações", key="crm_new_notes")
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
            _reset_new_form()
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

        selected_area = selected.get("area", "Negociação")
        if selected_area not in CRM_AREAS:
            selected_area = "Negociação"
        selected_statuses = AREA_STATUS_OPTIONS.get(selected_area, AREA_STATUS_OPTIONS["Negociação"])
        selected_status = selected.get("status", selected_statuses[0])
        if selected_status not in selected_statuses:
            selected_status = selected_statuses[0]
        selected_priority = selected.get("priority", "Média")
        if selected_priority not in PRIORITIES:
            selected_priority = "Média"
        selected_project = selected.get("project", "")
        if selected_project not in project_options:
            project_options = project_options + [selected_project] if selected_project else project_options

        with st.form("crm_edit_item"):
            title = st.text_input("Título", value=selected.get("title", ""))
            company = st.text_input("Empresa / cliente", value=selected.get("company", ""))
            project = st.selectbox(
                "Projeto relacionado",
                options=project_options,
                index=project_options.index(selected_project) if selected_project in project_options else 0,
                help="Escolha um projeto já importado no app ou deixe em branco.",
            )
            area = st.selectbox("Área", CRM_AREAS, index=CRM_AREAS.index(selected_area))
            current_statuses = AREA_STATUS_OPTIONS.get(area, AREA_STATUS_OPTIONS["Negociação"])
            if selected_status not in current_statuses:
                selected_status = current_statuses[0]
            status = st.selectbox("Status", current_statuses, index=_status_index(area, selected_status))
            priority = st.selectbox("Prioridade", PRIORITIES, index=PRIORITIES.index(selected_priority))
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
        uploaded_files = st.file_uploader(
            "Anexar documentos",
            key=f"file-{selected_id}",
            accept_multiple_files=True,
            help="Você pode selecionar vários arquivos de uma vez. Todos sobem para o Google Drive e ficam vinculados ao registro.",
        )
        if uploaded_files:
            st.caption(f"{len(uploaded_files)} arquivo(s) selecionado(s).")
            if st.button("Enviar anexos para o Drive", key=f"upload-{selected_id}", use_container_width=True):
                try:
                    documents_uploaded, errors = upload_crm_documents(selected, uploaded_files)
                    updated_docs = (selected.get("documents") or []) + documents_uploaded
                    upsert_crm_item({**selected, "documents": updated_docs})
                    if documents_uploaded:
                        st.success(f"{len(documents_uploaded)} arquivo(s) enviado(s) com sucesso.")
                    for error in errors:
                        st.error(f"Não foi possível enviar o documento: {error}")
                    st.rerun()
                except Exception as exc:
                    st.error(f"Não foi possível enviar os documentos: {exc}")

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
