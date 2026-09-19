# Operação segura

1. Publique a função `uby-whatsapp-daily-report` e aplique o SQL de auditoria.
2. Cadastre os segredos, deixando `WHATSAPP_ENABLED=false`.
3. Faça `preview` para uma competência já conferida no painel. Corrija a fonte de dados se houver divergência; não altere sessões para ajustar números.
4. Crie e aprove o template na Meta com o contrato exato. O retorno de criação não substitui a aprovação.
5. Cadastre um destinatário de teste autorizado no segredo e altere temporariamente `WHATSAPP_ENABLED=true`.
6. Faça um único `send` controlado. Registre o `wamid`; ele indica aceitação pela Meta, não leitura/entrega.
7. Configure webhook de status e, somente após observar entrega, configure o agendador diário para 05:00 America/Sao_Paulo. Se escolher Apps Script, execute uma única vez `instalarAgendamentoRelatorioWhatsAppUBY`; a execução ocorre na nuvem e não depende do PC.
8. Em produção, acompanhe a tabela `uby_whatsapp_delivery_log`. Se houver `queued`, `failed` ou `uncertain`, não repita a competência automaticamente.

O script `integrations/google-apps-script/UBY_WHATSAPP_DAILY_REPORT.gs` é apenas um gatilho opcional. Ele não armazena token da Meta: o token fica no Supabase.
