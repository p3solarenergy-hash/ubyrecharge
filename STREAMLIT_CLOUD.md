# Streamlit Cloud

## Entrypoint

- Arquivo principal do deploy: `app.py`
- Pasta de paginas: `pages/`

## Secrets

Cadastre estes secrets no Streamlit Cloud:

```toml
[google_oauth]
client_id = "SEU_CLIENT_ID"
client_secret = "SEU_CLIENT_SECRET"
project_id = "SEU_PROJECT_ID"

[google_token]
refresh_token = "SEU_REFRESH_TOKEN"
token_uri = "https://oauth2.googleapis.com/token"
scopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets"
]

[google_drive]
folder_id = "ID_DA_PASTA_NO_GOOGLE_DRIVE"

[google_maps]
api_key = "SUA_GOOGLE_MAPS_API_KEY"
```

## Como obter o refresh token

1. Rode o app localmente com `credentials.json`.
2. Use um usuario autorizado no modo teste do OAuth.
3. Sincronize o Google Drive uma vez.
4. Copie o `refresh_token` gerado em `drive_token.json`.
5. Use os escopos `https://www.googleapis.com/auth/drive` e `https://www.googleapis.com/auth/spreadsheets` para permitir leitura, gravação no Drive e edição de planilhas Google Sheets.

## Comportamento do app

- Os arquivos sincronizados ficam em `data/`
- A sincronizacao atualiza a `UBY_SCHEMA` com cidade, estado, latitude e longitude quando `google_maps.api_key` estiver configurada
- Apenas arquivos `.xlsx` sao baixados
- `.xlsx` removidos do Drive sao removidos da pasta local sincronizada
