"""movE Operacao — monitoramento operacional via API."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import pandas as pd
import streamlit as st

from utils.move_api import MoveApiError, MoveClient, get_move_config, is_configured, normalize_records
from utils.p3_styles import inject, page_header, section_title

inject()

page_header(
    "movE Operacao em tempo real",
    "Base para acompanhar usuarios, sessoes de recarga, carregadores e indicadores operacionais da primeira parceira.",
)

cfg = get_move_config()
configured = is_configured(cfg)
move_token = st.session_state.get("move_token", "")

RELEVANT_ENDPOINTS = [
    {"Uso": "Login", "Metodo": "POST", "Endpoint": "/api/v1/login", "Observacao": "gera token usando Api-Key, usuario e senha"},
    {"Uso": "Estacoes", "Metodo": "GET", "Endpoint": "/api/v1/chargepoints", "Observacao": "base para carregadores online/offline"},
    {"Uso": "Status do conector", "Metodo": "GET", "Endpoint": "/api/v1/chargepoints/{chargeBoxId}/connector/{connectorId}/status", "Observacao": "tempo real por conector"},
    {"Uso": "Recargas", "Metodo": "GET", "Endpoint": "/api/v1/transaction", "Observacao": "historico de sessoes"},
    {"Uso": "Recarga ativa", "Metodo": "GET", "Endpoint": "/api/v1/transaction/active_transaction", "Observacao": "sessoes em andamento"},
    {"Uso": "Estatisticas", "Metodo": "GET", "Endpoint": "/api/v1/stats/sums", "Observacao": "totalizadores operacionais"},
    {"Uso": "Graficos", "Metodo": "GET", "Endpoint": "/api/v1/stations/dashboard/graphs", "Observacao": "dados agregados para dashboard"},
    {"Uso": "Relatorio usuarios", "Metodo": "POST", "Endpoint": "/api/v1/report/assessment/users", "Observacao": "base dos relatorios de usuarios"},
    {"Uso": "Relatorio transacoes", "Metodo": "POST", "Endpoint": "/api/v1/report/xlsx/transactions", "Observacao": "exportacao oficial de recargas"},
]

if not configured:
    st.warning(
        "A integracao ainda nao esta configurada nos secrets. Nao coloque usuario e senha no HTML ou no GitHub Pages.",
        icon="🔐",
    )
    with st.expander("Configurar credenciais da movE", expanded=True):
        st.markdown("Adicione este bloco no `secrets.toml` local ou nos Secrets do Streamlit Cloud:")
        st.code(
            """
[move_api]
base_url = "https://cs-test.use-move.com"
docs_url = "https://cs-test.use-move.com/doc-api"
username = "SEU_USUARIO_MOVE"
password = "SUA_SENHA_MOVE"
api_key = "SUA_API_KEY_MOVE"
platform = "DASHBOARD"
token = ""
timeout = "30"
""".strip(),
            language="toml",
        )
        st.info(
            "Depois disso, esta pagina passa a conseguir testar endpoints e montar os relatorios com dados reais.",
            icon="ℹ️",
        )

client = MoveClient(cfg, token=move_token)

st.caption(f"Base configurada: `{cfg.base_url}`")
if move_token:
    st.success("Sessao autenticada na movE para testes desta tela.", icon="✅")

tab_live, tab_users, tab_sessions, tab_api, tab_plan = st.tabs(
    ["Tempo real", "Usuarios", "Sessoes", "Teste API", "Mapa da integracao"]
)

with tab_live:
    section_title("Painel operacional")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Carregadores online", "0")
    c2.metric("Sessoes ativas", "0")
    c3.metric("Energia hoje", "0 kWh")
    c4.metric("Receita hoje", "R$ 0")

    st.info(
        "Assim que os endpoints da movE forem mapeados, estes KPIs serao alimentados automaticamente.",
        icon="📡",
    )

    expected = pd.DataFrame(
        [
            {"Bloco": "Carregadores", "Dado": "online/offline, ocupado, potencia, conector, ultimo heartbeat"},
            {"Bloco": "Sessoes", "Dado": "inicio, fim, usuario, kWh, valor, status, carregador"},
            {"Bloco": "Usuarios", "Dado": "cadastro, historico, frequencia, consumo, ticket medio"},
            {"Bloco": "Financeiro", "Dado": "receita, repasse, transacoes, meios de pagamento"},
            {"Bloco": "Operacao", "Dado": "falhas, indisponibilidade, tempo ocioso, taxa de ocupacao"},
        ]
    )
    st.dataframe(expected, use_container_width=True, hide_index=True)
    st.markdown("**Endpoints ja mapeados na documentacao da movE**")
    st.dataframe(pd.DataFrame(RELEVANT_ENDPOINTS[:7]), use_container_width=True, hide_index=True)

with tab_users:
    section_title("Relatorio de usuarios")
    st.markdown(
        "Visao prevista: usuarios novos, usuarios recorrentes, ranking por consumo, frequencia de uso e historico por ponto."
    )
    st.dataframe(
        pd.DataFrame(
            [
                {"Indicador": "Usuarios totais", "Status": "Aguardando endpoint"},
                {"Indicador": "Usuarios ativos no mes", "Status": "Aguardando endpoint"},
                {"Indicador": "Consumo medio por usuario", "Status": "Aguardando endpoint"},
                {"Indicador": "Top usuarios por kWh", "Status": "Aguardando endpoint"},
            ]
        ),
        use_container_width=True,
        hide_index=True,
    )

with tab_sessions:
    section_title("Acompanhamento de sessoes")
    st.markdown(
        "Visao prevista: sessoes em andamento, sessoes finalizadas, kWh entregue, tempo medio de recarga e receita por carregador."
    )
    st.dataframe(
        pd.DataFrame(
            [
                {"Campo": "session_id", "Uso": "identificar a recarga"},
                {"Campo": "charger_id", "Uso": "ligar a sessao ao carregador e a obra"},
                {"Campo": "user_id", "Uso": "relatorio de usuarios"},
                {"Campo": "energy_kwh", "Uso": "energia entregue"},
                {"Campo": "amount", "Uso": "faturamento"},
                {"Campo": "status", "Uso": "em andamento, finalizada, erro"},
            ]
        ),
        use_container_width=True,
        hide_index=True,
    )

with tab_api:
    section_title("Teste tecnico da API")
    if not configured:
        st.info("Configure usuario, senha e Api-Key nos secrets para habilitar os testes reais.", icon="🔐")
    else:
        col_login, col_token = st.columns([1, 3])
        with col_login:
            if st.button("Autenticar movE", type="primary", use_container_width=True):
                try:
                    data = client.login()
                    token = str(data.get("token") or "").strip()
                    if token:
                        st.session_state["move_token"] = token
                        st.success("Token recebido. Continue testando os endpoints.")
                    else:
                        st.warning("Login respondeu sem token. Verifique a resposta abaixo.")
                        st.json(data)
                except MoveApiError as exc:
                    st.error(str(exc))
                except Exception as exc:
                    st.error(f"Erro inesperado no login: {exc}")
        with col_token:
            st.caption("A documentacao da MOVE exige `Api-Key` no login e `Authorization` nos endpoints operacionais.")

        col_a, col_b = st.columns([2, 1])
        with col_a:
            endpoint_options = [item["Endpoint"] for item in RELEVANT_ENDPOINTS if item["Endpoint"] != "/api/v1/login"]
            selected_endpoint = st.selectbox("Endpoint mapeado", endpoint_options, index=0)
            endpoint = st.text_input(
                "Endpoint ou URL para testar",
                value=selected_endpoint,
                help="Use um caminho relativo como /api/... ou uma URL completa.",
            )
        with col_b:
            method = st.selectbox("Metodo", ["GET", "POST"], index=0)
        body_text = st.text_area("JSON do corpo (opcional)", value="", height=100)

        if st.button("Testar endpoint", type="primary", use_container_width=True):
            try:
                payload: dict[str, Any] | None = None
                if body_text.strip():
                    payload = json.loads(body_text)
                with st.spinner("Consultando movE..."):
                    if method == "POST":
                        response = client.request(endpoint, method="POST", json=payload)
                    else:
                        response = client.request(endpoint, method="GET")
                    content_type = response.headers.get("content-type", "")
                    st.success(f"Resposta HTTP {response.status_code} em {datetime.now().strftime('%H:%M:%S')}")
                    if "json" in content_type.lower():
                        data = response.json()
                        st.json(data)
                        rows = normalize_records(data)
                        if rows:
                            st.dataframe(pd.DataFrame(rows), use_container_width=True)
                    else:
                        st.text(response.text[:5000])
            except json.JSONDecodeError:
                st.error("O corpo informado nao e um JSON valido.")
            except MoveApiError as exc:
                st.error(str(exc))
            except Exception as exc:
                st.error(f"Erro inesperado: {exc}")

with tab_plan:
    section_title("Como isso entra na UBY")
    st.dataframe(pd.DataFrame(RELEVANT_ENDPOINTS), use_container_width=True, hide_index=True)
    st.markdown(
        """
**Arquitetura correta**

1. Streamlit/backend guarda usuario e senha da movE em `secrets`.
2. Backend consulta a movE em intervalos curtos ou sob demanda.
3. A plataforma mostra apenas dados tratados: KPIs, tabelas e graficos.
4. Cada carregador deve ser associado a uma obra concluida da nossa base.
5. O historico pode ser salvo depois em Google Sheets, banco SQL ou Supabase.

**Relatorios que devemos criar**

- Operacao em tempo real: status dos carregadores, sessoes ativas e alertas.
- Usuarios: novos, recorrentes, consumo, frequencia, ticket medio.
- Financeiro: receita, repasse, transacoes e ticket por ponto.
- Ocupacao: uso por hora, dia da semana, carregador e local.
- Manutencao: falhas, quedas de comunicacao e tempo offline.
"""
    )
