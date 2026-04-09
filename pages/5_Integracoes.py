import os
import sys
import time

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.drive_sync import (
    CFG_FILE,
    CREDS_FILE,
    TOKEN_FILE,
    get_folder_id,
    get_runtime_mode,
    has_client_credentials,
    has_refresh_token,
    is_configured,
    list_drive_files,
    load_config,
    save_config,
    sync_all,
)
from utils.excel_reader import EXCEL_DIR

st.set_page_config(page_title="Integracoes | UBY RECHARGE", page_icon="🔌", layout="wide")
st.title("🔌 Integracoes")
st.markdown("---")

tab_drive, tab_platforms = st.tabs(["☁️ Google Drive", "⚡ Plataformas EV"])

with tab_drive:
    config = load_config()
    runtime_mode = get_runtime_mode()
    folder_id = get_folder_id()
    folder_ok = bool(folder_id)
    creds_ok = has_client_credentials()
    token_ok = has_refresh_token() or os.path.exists(TOKEN_FILE)
    cloud_ready = folder_ok and creds_ok and token_ok

    st.markdown("### ☁️ Google Drive como base de dados")
    st.caption("O deploy no Streamlit Cloud usa secrets para autenticar e sincronizar arquivos do Google Drive, incluindo subpastas.")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("OAuth client", "✅ OK" if creds_ok else "❌ Faltando")
    c2.metric("Refresh token", "✅ OK" if token_ok else "❌ Faltando")
    c3.metric("Pasta Drive", "✅ OK" if folder_ok else "❌ Faltando")
    c4.metric("Modo", "☁️ Cloud" if runtime_mode == "streamlit-cloud-ready" else "💻 Local")

    st.markdown("---")

    with st.expander("1. Secrets para Streamlit Cloud", expanded=not cloud_ready):
        st.markdown(
            """
Cole estes dados em **Streamlit Cloud -> App settings -> Secrets**.

```toml
[google_oauth]
client_id = "SEU_CLIENT_ID"
client_secret = "SEU_CLIENT_SECRET"
project_id = "SEU_PROJECT_ID"

[google_token]
refresh_token = "SEU_REFRESH_TOKEN"
token_uri = "https://oauth2.googleapis.com/token"
scopes = ["https://www.googleapis.com/auth/drive.readonly"]

[google_drive]
folder_id = "ID_DA_PASTA_NO_GOOGLE_DRIVE"
```
"""
        )

        st.info(
            "O app tambem aceita variaveis de ambiente equivalentes, mas no Streamlit Cloud o caminho mais simples e seguro e usar secrets."
        )
        st.caption(
            "O credentials.json e o drive_token.json continuam funcionando localmente como fallback, mas nao sao mais necessarios no deploy."
        )

    with st.expander("2. Como gerar o refresh token localmente", expanded=creds_ok and not token_ok):
        st.markdown(
            """
1. Deixe o app OAuth em modo de teste no Google Cloud.
2. Garanta que o email `p3solarenergy@gmail.com` esteja em **Test users**.
3. Rode o app localmente uma vez com `credentials.json`.
4. Clique em **Sincronizar agora** nesta tela.
5. O navegador vai pedir login e permissao.
6. Depois copie o valor de `refresh_token` do arquivo `drive_token.json` para o Streamlit Cloud.

Se o Google continuar retornando `403 access_denied`, quase sempre falta publicar o usuario de teste correto ou usar outro email nao autorizado.
"""
        )
        st.code(str(TOKEN_FILE), language=None)

    with st.expander("3. Pasta sincronizada e arquivos aceitos", expanded=folder_ok and cloud_ready):
        st.markdown(
            f"""
- Pasta local sincronizada: `{EXCEL_DIR}`
- O app percorre a pasta principal e tambem as subpastas do Google Drive
- Arquivos `.xlsx` sao baixados como estao
- Planilhas nativas do Google Sheets sao exportadas automaticamente para `.xlsx`
- Arquivos que nao sao planilhas sao ignorados
- Planilhas removidas do Drive tambem sao removidas da pasta local sincronizada
"""
        )
        if folder_ok:
            st.code(folder_id, language=None)

    with st.expander("4. Configuracao local opcional", expanded=runtime_mode == "local-file" and not folder_ok):
        st.markdown(
            """
Para continuar trabalhando localmente, voce ainda pode:

1. Manter o `credentials.json` na raiz do projeto.
2. Salvar o ID da pasta do Drive abaixo.
3. Gerar o `drive_token.json` na primeira autenticacao.
"""
        )

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

    st.markdown("---")
    st.markdown("#### Sincronizacao")

    if not folder_ok:
        st.warning("Configure o `folder_id` no Streamlit secrets ou no `drive_config.json` local.")
    elif not creds_ok:
        st.warning("Configure o bloco `[google_oauth]` no Streamlit Cloud ou mantenha o `credentials.json` local.")
    elif not token_ok and runtime_mode == "streamlit-cloud-ready":
        st.warning("Falta o `refresh_token` para a execucao online.")
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
                            for filename in downloaded:
                                st.markdown(f"- 📄 `{filename}`")
                        if errors:
                            for error in errors:
                                st.error(error)
                        if not downloaded and not errors:
                            st.info("Nenhuma planilha compativel encontrada na pasta configurada.")
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
                        relative_path = item.get("relative_path", item["name"])
                        st.markdown(f"- 📄 `{relative_path}` - {origin} - {size_kb} KB - {modified}")
                else:
                    st.info("A pasta do Drive esta vazia ou sem planilhas compativeis.")
            except Exception as exc:
                st.caption(f"Preview indisponivel: {exc}")

    st.markdown("---")
    st.markdown("#### Arquivos locais usados pelo modo antigo")
    st.code(
        "\n".join(
            [
                f"credentials.json -> {CREDS_FILE}",
                f"drive_token.json -> {TOKEN_FILE}",
                f"drive_config.json -> {CFG_FILE}",
            ]
        ),
        language=None,
    )

with tab_platforms:
    st.markdown("### Plataformas de Gestao de Recarga")
    st.caption("Espaco reservado para futuras integracoes alem do Google Drive.")
    st.markdown("---")

    col1, col2, col3 = st.columns(3)
    for col, name, color, description in [
        (col1, "⚡ Tupi", "#00c8ff", "Plataforma de gestao de recarga"),
        (col2, "🚗 Move", "#ffa500", "Monitoramento e telemetria EV"),
        (col3, "🔋 OnCharge", "#00e676", "Gestao de sessoes de recarga"),
    ]:
        col.markdown(
            f"""
        <div style="background:#1e2130;border-radius:12px;padding:24px;border-top:4px solid {color};">
            <h3 style="margin:0 0 8px;">{name}</h3>
            <p style="color:#aaa;font-size:0.9rem;">{description}</p>
            <span style="background:#2a3a4a;padding:4px 12px;border-radius:20px;font-size:0.8rem;color:#888;">Em breve</span>
        </div>
        """,
            unsafe_allow_html=True,
        )
