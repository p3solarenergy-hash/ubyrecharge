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
scopes = ["https://www.googleapis.com/auth/drive"]

[google_drive]
folder_id = "ID_DA_PASTA_NO_GOOGLE_DRIVE"
```

## Como obter o refresh token

1. Rode o app localmente com `credentials.json`.
2. Use um usuario autorizado no modo teste do OAuth.
3. Sincronize o Google Drive uma vez.
4. Copie o `refresh_token` gerado em `drive_token.json`.
5. Use o escopo `https://www.googleapis.com/auth/drive` para permitir leitura e gravação de localizações.

## Comportamento do app

- Os arquivos sincronizados ficam em `data/`
- Apenas arquivos `.xlsx` sao baixados
- `.xlsx` removidos do Drive sao removidos da pasta local sincronizada
