---
name: uby-whatsapp-reporting
description: "Opera a integração segura dos relatórios diários da UBY Recharge com a API oficial do WhatsApp. Use para configurar, validar, testar, agendar, diagnosticar ou recuperar o envio diário, sem expor segredos ou alterar a base de recargas."
---

# Uby Whatsapp Reporting

Use esta skill para transformar as métricas reais da rede UBY em mensagens de WhatsApp pela Cloud API da Meta. A skill serve para manter a operação; o runtime é a Edge Function `supabase/functions/uby-whatsapp-daily-report`, nunca o PC do usuário.

## Fonte de verdade e invariantes

- Calcule a partir de `recharge_sessions`, preservando todas as fontes e filtrando somente `malassise`, `posto-central-jk` e `ac-posto-central-jk`.
- Central JK AC e DC são ativos diferentes. Nunca complete uma com dados da outra.
- A competência é o dia de início da recarga em `America/Sao_Paulo`. O envio de 05:00 usa, por padrão, o dia local anterior já fechado.
- Conte somente sessões executadas, usando a mesma regra do Painel UBY: excluir falhas/cancelamentos, energia e receita quase nulas e sessões muito curtas sem energia relevante.
- Faturamento, energia, recargas, clientes e novos clientes precisam ser calculados juntos no mesmo recorte. Não use cache, `localStorage`, o e-mail anterior ou totais acumulados como fonte.
- `novos clientes` é a primeira sessão executada conhecida daquele cliente na rede UBY; a variação compara o faturamento com o dia local anterior.

## Fluxo obrigatório

1. Rode `preview` para a competência desejada e compare os números com o Painel UBY antes de qualquer envio.
2. Confirme que o modelo Meta está aprovado, com categoria permitida, idioma e nomes de parâmetros idênticos ao contrato em [configuration-contract.md](references/configuration-contract.md).
3. Guarde token, segredo de job e destinatários exclusivamente nos segredos da Edge Function. Nunca os ponha no Git, GitHub Pages, browser, e-mail ou conversa.
4. Aplique a tabela de auditoria em `supabase/uby_whatsapp_daily_report.sql` antes de liberar `send`; sem ela, a função deve falhar fechada.
5. Faça um envio manual apenas para destinatário autorizado e observe o retorno da Graph API. O `wamid` confirma aceitação, não entrega; use webhook de status antes de declarar a operação ativa.
6. Só então agende o POST diário no runtime servidor. O exemplo de Apps Script é um gatilho possível, mas não é requisito nem deve guardar token Meta.

## Modos da função

- `preview` é o padrão e nunca chama a Meta.
- `send` requer o segredo de job, `WHATSAPP_ENABLED=true`, modelo configurado, destinatários configurados e auditoria disponível.
- Uma competência já registrada para o mesmo modelo e destinatário é bloqueada. Não limpe logs nem force reenvio sem confirmar se houve entrega.

## Limites de segurança

- Não crie portfólio Meta duplicado e não prometa que trocar de Gmail resolverá o vínculo da API.
- Não peça ao usuário para colar `WHATSAPP_ACCESS_TOKEN`, token de sistema, códigos de autenticação ou senha. Oriente a cadastrar segredos no painel seguro do Supabase.
- Não declare que o WhatsApp está ativo por um teste local, por um template criado ou por HTTP 200 da Meta. Exija configuração salva, execução controlada e retorno observável.
- Não mude dados de `recharge_sessions`, obras, clientes ou relatórios para fazer uma mensagem bater. Em divergências, audite o recorte primeiro.

## Diagnóstico rápido

- Sem app Meta, WABA ou template aprovado: mantenha `preview`; código pronto não habilita envio.
- `400` da Graph API: compare nome do modelo, idioma, formato `NAMED`/`POSITIONAL` e exemplos aprovados.
- `401`/`403`: confirme segredo de job na Edge Function e permissões do token de system user, sem expor o token.
- `409`/bloqueio de duplicidade: consulte a auditoria; não repita automaticamente.

Leia [configuration-contract.md](references/configuration-contract.md) para os segredos e payload esperado e [operational-runbook.md](references/operational-runbook.md) para a sequência de ativação.
