"""
Integrações — Google Drive, plataformas EV e próximas conexões
"""
import os
import sys
import time
from pathlib import Path

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.drive_sync import (
    CFG_FILE, CREDS_FILE, TOKEN_FILE,
    get_folder_id, get_runtime_mode,
    has_client_credentials, has_refresh_token, is_configured,
    list_drive_files, load_config, save_config, sync_all,
)
from utils.excel_reader import EXCEL_DIR
from utils.p3_styles import inject, page_header, section_title, badge

inject()

APP_DIR = Path(__file__).resolve().parent.parent
SECRETS_TEMPLATE_PATH = APP_DIR / "STREAMLIT_SECRETS_TEMPLATE.toml"
SECRETS_TEMPLATE = SECRETS_TEMPLATE_PATH.read_text(encoding="utf-8")

page_header(
    "🔌 Integrações",
    "Gerencie a conexão com Google Drive e plataformas de recarga EV.",
)

tab_drive, tab_platforms = st.tabs(["☁️ Google Drive", "⚡ Plataformas EV"])

# ── ABA GOOGLE DRIVE ──────────────────────────────────────────────────────────
with tab_drive:
    config       = load_config()
    runtime_mode = get_runtime_mode()
    folder_id    = get_folder_id()
    folder_ok    = bool(folder_id)
    creds_ok     = has_client_credentials()
    token_ok     = has_refresh_token() or os.path.exists(TOKEN_FILE)
    cloud_ready  = folder_ok and creds_ok and token_ok

    section_title("☁️ Google Drive como base de dados")
    st.caption("O deploy no Streamlit Cloud usa secrets para autenticar e sincronizar arquivos do Google Drive, incluindo subpastas.")

    # Status cards
    k1, k2, k3, k4 = st.columns(4)
    with k1:
        with st.container(border=True):
            ok = creds_ok
            st.markdown(
                f"<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px'>OAuth Client</div>"
                f"<div style='font-size:22px'>{'✅' if ok else '❌'}</div>"
                f"<div style='font-size:12px;color:{'#3FB66B' if ok else '#E55545'}'>{'Configurado' if ok else 'Faltando'}</div>",
                unsafe_allow_html=True,
            )
    with k2:
        with st.container(border=True):
            ok = token_ok
            st.markdown(
                f"<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px'>Refresh Token</div>"
                f"<div style='font-size:22px'>{'✅' if ok else '❌'}</div>"
                f"<div style='font-size:12px;color:{'#3FB66B' if ok else '#E55545'}'>{'Configurado' if ok else 'Faltando'}</div>",
                unsafe_allow_html=True,
            )
    with k3:
        with st.container(border=True):
            ok = folder_ok
            st.markdown(
                f"<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px'>Pasta Drive</div>"
                f"<div style='font-size:22px'>{'✅' if ok else '❌'}</div>"
                f"<div style='font-size:12px;color:{'#3FB66B' if ok else '#E55545'}'>{'Configurada' if ok else 'Faltando'}</div>",
                unsafe_allow_html=True,
            )
    with k4:
        with st.container(border=True):
            is_cloud = runtime_mode == "streamlit-cloud-ready"
            st.markdown(
                f"<div style='font-size:10px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px'>Modo</div>"
                f"<div style='font-size:22px'>{'☁️' if is_cloud else '💻'}</div>"
                f"<div style='font-size:12px;color:#E8EFEB'>{'Cloud' if is_cloud else 'Local'}</div>",
                unsafe_allow_html=True,
            )

    st.markdown("")

    with st.expander("1. Secrets para Streamlit Cloud", expanded=not cloud_ready):
        st.markdown("Cole estes dados em **Streamlit Cloud → App settings → Secrets**.")
        st.code(SECRETS_TEMPLATE, language="toml")
        st.download_button(
            "⬇️ Baixar template de secrets",
            data=SECRETS_TEMPLATE,
            file_name="STREAMLIT_SECRETS_TEMPLATE.toml",
            mime="text/plain",
            use_container_width=True,
            type="primary",
        )
        st.info("O app também aceita variáveis de ambiente equivalentes, mas no Streamlit Cloud o caminho mais simples e seguro é usar secrets.", icon="ℹ️")

    with st.expander("2. Como gerar o refresh token localmente", expanded=creds_ok and not token_ok):
        st.markdown("""
1. Deixe o app OAuth em modo de teste no Google Cloud.
2. Garanta que `p3solarenergy@gmail.com` esteja em **Test users**.
3. Rode o app localmente com `credentials.json`.
4. Clique em **Sincronizar agora** nesta tela.
5. O navegador pedirá login e permissão.
6. Copie o `refresh_token` do `drive_token.json` para o Streamlit Cloud.
7. Use os escopos `https://www.googleapis.com/auth/drive` e `https://www.googleapis.com/auth/spreadsheets`.
""")
        st.code(str(TOKEN_FILE), language=None)

    with st.expander("3. Pasta sincronizada e arquivos aceitos", expanded=folder_ok and cloud_ready):
        st.markdown(f"""
- Pasta local sincronizada: `{EXCEL_DIR}`
- O app percorre a pasta principal e subpastas do Google Drive
- Arquivos `.xlsx` são baixados como estão
- Planilhas Google Sheets são exportadas automaticamente para `.xlsx`
- Arquivos que não são planilhas são ignorados
- Planilhas removidas do Drive também são removidas da pasta local
""")
        if folder_id:
            st.code(folder_id, language=None)

    with st.expander("4. Configuração local opcional", expanded=runtime_mode == "local-file" and not folder_ok):
        with st.form("form_folder"):
            folder_input = st.text_input(
                "ID da pasta do Drive",
                value=config.get("folder_id", ""),
                placeholder="Ex: 1XoctKFr5Ei_qIrjbRUbDe_Ore0UIWj72",
            )
            submitted = st.form_submit_button("💾 Salvar", type="primary")
            if submitted:
                if folder_input.strip():
                    config["folder_id"] = folder_input.strip()
                    save_config(config)
                    st.success("Pasta configurada.")
                    time.sleep(1)
                    st.rerun()
                else:
                    st.error("Cole o ID da pasta do Google Drive.")

    st.markdown("")
    section_title("Sincronização")

    if not folder_ok:
        st.warning("Configure o `folder_id` no Streamlit secrets ou no `drive_config.json` local.", icon="⚠️")
    elif not creds_ok:
        st.warning("Configure o bloco `[google_oauth]` no Streamlit Cloud ou mantenha o `credentials.json` local.", icon="⚠️")
    elif not token_ok and runtime_mode == "streamlit-cloud-ready":
        st.warning("Falta o `refresh_token` para execução online.", icon="⚠️")
    else:
        col_btn, col_info = st.columns([1, 2])
        with col_btn:
            if st.button("🔄 Sincronizar agora", type="primary", use_container_width=True):
                with st.spinner("Sincronizando planilhas do Google Drive..."):
                    try:
                        downloaded, errors = sync_all(folder_id=folder_id, dest_dir=EXCEL_DIR)
                        st.cache_data.clear()
                        if downloaded:
                            st.success(f"{len(downloaded)} planilha(s) sincronizada(s).")
                            for f in downloaded:
                                st.markdown(f"- 📄 `{f}`")
                        if errors:
                            for e in errors:
                                st.error(e)
                        if not downloaded and not errors:
                            st.info("Nenhuma planilha compatível encontrada na pasta configurada.")
                    except Exception as exc:
                        st.error(f"Erro ao sincronizar: {exc}")

        with col_info:
            st.caption(f"Pasta local de dados: `{EXCEL_DIR}`")
            try:
                files = list_drive_files(folder_id)
                if files:
                    st.markdown(f"**{len(files)} planilha(s) encontrada(s) no Drive:**")
                    for item in files:
                        size_kb = int(item.get("size", 0)) // 1024
                        modified = item.get("modifiedTime", "")[:10]
                        origin = "Google Sheets" if item.get("mimeType") == "application/vnd.google-apps.spreadsheet" else "XLSX"
                        rel = item.get("relative_path", item["name"])
                        st.markdown(f"- 📄 `{rel}` — {origin} — {size_kb} KB — {modified}")
                else:
                    st.info("A pasta do Drive está vazia ou sem planilhas compatíveis.")
            except Exception as exc:
                st.caption(f"Preview indisponível: {exc}")

# ── ABA PLATAFORMAS EV ────────────────────────────────────────────────────────
with tab_platforms:
    section_title("⚡ Plataformas de Gestão de Recarga")
    st.caption("Integrações futuras com as plataformas operacionais de carregamento.")
    st.markdown("")

    plataformas = [
        ("⚡ Tupi",     "#3FB66B", "Plataforma de gestão de recarga",       "Em breve"),
        ("🚗 MOVE",     "#FFD66B", "Monitoramento e telemetria EV",          "Em breve"),
        ("🔋 OnCharge", "#5BC882", "Gestão de sessões de recarga",           "Em breve"),
        ("📡 OCPP",     "#7FCCFF", "Protocolo aberto para carregadores",     "Em desenvolvimento"),
        ("📊 Supabase", "#F2A93D", "Backend em tempo real para dados de uso","Em desenvolvimento"),
        ("📱 Instagram","#E55545", "Agente de respostas automáticas",        "Em desenvolvimento"),
    ]

    for i in range(0, len(plataformas), 3):
        cols = st.columns(3)
        for j, col in enumerate(cols):
            if i + j >= len(plataformas):
                break
            nome, cor, desc, status = plataformas[i + j]
            with col:
                with st.container(border=True):
                    st.markdown(
                        f"<div style='border-top:3px solid {cor};margin:-1px -1px 12px;border-radius:2px 2px 0 0'></div>"
                        f"<div style='font-size:20px;font-weight:700;color:#E8EFEB;margin-bottom:6px'>{nome}</div>"
                        f"<div style='font-size:12px;color:#8FA39A;margin-bottom:12px'>{desc}</div>"
                        f"<span style='background:#2A3530;padding:3px 10px;border-radius:12px;font-size:11px;color:{cor};font-weight:600'>{status}</span>",
                        unsafe_allow_html=True,
                    )

    st.markdown("")
    st.info(
        "Quando uma integração for ativada, os dados aparecerão automaticamente "
        "nas abas **Taxa de Ocupação**, **Métricas** e **Visão Geral**.",
        icon="📡",
    )

st.markdown("---")
st.caption("P3 Energy • Integrações e configurações de backend.")
