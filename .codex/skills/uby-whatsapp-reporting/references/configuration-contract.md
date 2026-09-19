# Contrato de configuração UBY–WhatsApp

## Segredos da Edge Function

Cadastre estes valores apenas em **Supabase > Edge Functions > Secrets**. Nunca os salve no repositório.

| Segredo | Uso |
| --- | --- |
| `UBY_WHATSAPP_JOB_SECRET` | Autoriza chamadas internas do agendador pelo cabeçalho `x-uby-whatsapp-job-secret`. |
| `WHATSAPP_ENABLED` | Deve ser literalmente `true` para liberar `send`. Ausente ou diferente mantém bloqueado. |
| `WHATSAPP_ACCESS_TOKEN` | Token de system user com `whatsapp_business_messaging`. |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número remetente na Cloud API. |
| `WHATSAPP_GRAPH_API_VERSION` | Versão Graph API explicitamente escolhida no onboarding. |
| `WHATSAPP_TEMPLATE_NAME` | Nome exato do template aprovado. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Normalmente `pt_BR`. |
| `WHATSAPP_TEMPLATE_PARAMETER_FORMAT` | `NAMED` ou `POSITIONAL`; corresponde ao formato aprovado pela Meta. |
| `WHATSAPP_DAILY_RECIPIENTS` | Números E.164 separados por vírgula, só dígitos; não versionar. |

Opcionais para webhook posterior: `WHATSAPP_WABA_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`.

## Template recomendado

Nome sugerido: `resultado_diario_uby`
Idioma: `pt_BR`
Formato: `NAMED`

```text
Resultado diário da Rede UBY

Competência: {{competencia}}
Faturamento de recargas: {{faturamento}}
Energia entregue: {{energia_kwh}}
Recargas: {{recargas}}
Clientes atendidos: {{clientes}}
Novos clientes na rede: {{clientes_novos}}
Variação vs. dia anterior: {{variacao_percentual}}

Acompanhamento automático UBY Recharge.
```

Inclua exemplos para **todas** as variáveis na revisão da Meta. Não adicione URL, botão ou variáveis extras na primeira versão.

## Parâmetros enviados

Para `NAMED`, a função envia um componente `body` com `parameter_name` idêntico ao template:

```json
[
  { "type": "text", "parameter_name": "competencia", "text": "08/09/2026" },
  { "type": "text", "parameter_name": "faturamento", "text": "R$ 705,42" },
  { "type": "text", "parameter_name": "energia_kwh", "text": "409,99 kWh" },
  { "type": "text", "parameter_name": "recargas", "text": "24" },
  { "type": "text", "parameter_name": "clientes", "text": "18" },
  { "type": "text", "parameter_name": "clientes_novos", "text": "1" },
  { "type": "text", "parameter_name": "variacao_percentual", "text": "+52,69%" }
]
```

Para `POSITIONAL`, a ordem é exatamente a mesma, sem `parameter_name`.
