# Notificações no celular (Web Push)

O app da Nova plataforma (instalado no celular ou aberto no Chrome) recebe avisos na tela do celular, mesmo fechado. Não passa pela Play Store: usa o service worker que o app já tem.

## Peças

- `supabase/push_notificacoes.sql`: cria duas tabelas que só a função lê e grava:
  - `uby_push_subscriptions`: um registro por aparelho ativado;
  - `uby_push_vapid`: o par de chaves de envio, gerado pela própria função na primeira chamada. A chave privada nunca sai do Supabase.
- `supabase/functions/uby-push/index.ts`: função chamada pela plataforma com o login do usuário. Ações:
  - `config`: devolve a chave pública;
  - `subscribe` / `unsubscribe`: liga ou desliga o aparelho;
  - `test`: manda um teste para os aparelhos da própria conta.
- `docs/nova/sw.js`: mostra a notificação e, no toque, abre a tela do aviso.
- `docs/nova/app/push.js` e `docs/nova/app/views/ajustes.js`: seção **Notificações neste aparelho** na tela **Ajustes** (último item do menu).

## Publicar (uma vez)

Não precisa gerar chave nenhuma: a função cria as chaves sozinha.

1. **Banco:** no Supabase, abra **SQL Editor**, cole todo o `supabase/push_notificacoes.sql` e clique em **Run**.
2. **Função:** no Supabase, abra **Edge Functions → Deploy a new function → Via Editor**.
   - Nome: `uby-push`.
   - Cole o `supabase/functions/uby-push/index.ts` e clique em **Deploy**.
   - Deixe **Enforce JWT verification** ligado: só quem está logado na plataforma usa.
   - Pela linha de comando, o equivalente é:
     ```bash
     npx supabase functions deploy uby-push --project-ref csxafzuaqbbsbdatuhrd
     ```
3. **Site:** publique os arquivos de `docs/nova` (commit + push na `master`). O GitHub Pages atualiza em 1 a 2 minutos.

**Opcional:** para usar chaves próprias, crie os segredos `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` em **Edge Functions → Secrets** (gere com `npx web-push generate-vapid-keys`). Eles passam a valer no lugar das chaves do banco, e cada aparelho precisa tocar em **Ativar** de novo.

## Testar no Android

1. No Chrome do celular, abra a plataforma e entre com o seu login. Se o app já estiver instalado, use o app.
2. Abra o menu e vá em **Ajustes**, no fim da lista. Ali aparece **Notificações neste aparelho**.
3. Toque em **Ativar notificações** e depois em **Permitir**.
4. Toque em **Enviar notificação de teste**. Em alguns segundos aparece "UBY Recharge — Teste…" na tela. Tocando nela, o app abre em Avisos.
5. Feche o app e mande outro teste pelo computador: logado na mesma conta, abra **Ajustes** e clique em **Enviar teste aos meus aparelhos**. O teste vai para todos os aparelhos ativados nessa conta.

## Se não chegar

- **Erro ao ativar ("relation uby_push_vapid does not exist" ou parecido):** falta o passo 1.
- **"Failed to send a request to the Edge Function":** falta o passo 2.
- **"Bloqueadas":** abra Configurações do Android → Apps → Chrome (ou UBY) → Notificações e libere. Depois recarregue a página.
- **Celular em economia de bateria:** o Android pode atrasar o aviso alguns minutos.
- **Trocou as chaves:** cada aparelho precisa tocar em **Ativar** de novo.
- **Aparelho que desinstalou o app ou bloqueou as notificações:** sai da lista sozinho no próximo envio.

## Próximos passos

Por enquanto só existe o envio de teste. Os avisos de verdade entram como novas ações na mesma função, disparadas por agendamento (`pg_cron`, como o relatório do WhatsApp). Exemplos:

- resumo do dia;
- carregador sem recarga;
- conta vencendo.
