# UBY WhatsApp daily report

Edge Function protegida para pré-visualizar e enviar o resultado diário fechado da Rede UBY pela WhatsApp Cloud API.

## Chamada

Use `POST` com o cabeçalho `x-uby-whatsapp-job-secret`. O padrão é `preview` e não envia mensagens:

```json
{ "mode": "preview", "competence": "2026-09-08" }
```

Para o único envio controlado, depois de configurar e aprovar tudo:

```json
{ "mode": "send", "competence": "2026-09-08" }
```

O endpoint bloqueia novo envio para a mesma competência, template e destinatário. Um retorno `sent` contém aceitação da Meta; configure webhook de status antes de considerar a entrega confirmada.

Veja `.codex/skills/uby-whatsapp-reporting/references/configuration-contract.md` para os segredos e o template.
