# Notificações no celular (Web Push)

O app da Nova plataforma (instalado no celular ou aberto no Chrome) recebe avisos na tela do celular, mesmo fechado. Não passa pela Play Store: usa o service worker que o app já tem.

## Peças

- `supabase/push_notificacoes.sql`: cria a tabela `uby_push_subscriptions` (um registro por aparelho ativado). Só a função lê e grava.
- `supabase/functions/uby-push/index.ts`: função chamada pela plataforma com o login do usuário. Ações:
  - `config`: devolve a chave pública;
  - `subscribe` / `unsubscribe`: liga ou desliga o aparelho;
  - `test`: manda um teste para os aparelhos da própria conta.
- `docs/nova/sw.js`: mostra a notificação e, no toque, abre a tela do aviso.
- `docs/nova/app/push.js`: seção **Notificações neste aparelho** na Central de avisos.

## Publicar (uma vez)

1. **Chaves:** num computador com Node instalado, rode:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Saem duas chaves: **Public Key** e **Private Key**. A privada é secreta: não coloque no código nem mande por mensagem.
2. **Segredos:** no Supabase, abra **Edge Functions → Secrets** e crie:
   - `VAPID_PUBLIC_KEY`: a Public Key;
   - `VAPID_PRIVATE_KEY`: a Private Key.
3. **Banco:** no Supabase, abra **SQL Editor**, cole todo o `supabase/push_notificacoes.sql` e clique em **Run**.
4. **Função:** no Supabase, abra **Edge Functions → Deploy a new function → Via Editor**.
   - Nome: `uby-push`.
   - Cole o `supabase/functions/uby-push/index.ts` e clique em **Deploy**.
   - Deixe **Enforce JWT verification** ligado: só quem está logado na plataforma usa.
   - Pela linha de comando, o equivalente é:
     ```bash
     npx supabase functions deploy uby-push --project-ref csxafzuaqbbsbdatuhrd
     ```
5. **Site:** publique os arquivos de `docs/nova` (commit + push na `master`). O GitHub Pages atualiza em 1 a 2 minutos.

## Testar no Android

1. No Chrome do celular, abra a plataforma e entre com o seu login. Se o app já estiver instalado, use o app.
2. Vá em **Avisos**. No topo aparece **Notificações neste aparelho**.
3. Toque em **Ativar notificações** e depois em **Permitir**.
4. Toque em **Enviar notificação de teste**. Em alguns segundos aparece "UBY Recharge — Teste…" na tela. Tocando nela, o app abre em Avisos.
5. Feche o app e mande outro teste pelo computador: logado na mesma conta, abra **Avisos** e clique em **Enviar teste aos meus aparelhos**. O teste vai para todos os aparelhos ativados nessa conta.

## Se não chegar

- **"Chaves VAPID não configuradas":** falta o passo 2.
- **"Bloqueadas":** abra Configurações do Android → Apps → Chrome (ou UBY) → Notificações e libere. Depois recarregue a página.
- **Celular em economia de bateria:** o Android pode atrasar o aviso alguns minutos.
- **Trocou as chaves:** cada aparelho precisa tocar em **Ativar** de novo.
- **Aparelho que desinstalou o app ou bloqueou as notificações:** sai da lista sozinho no próximo envio.

## Próximos passos

Por enquanto só existe o envio de teste. Os avisos de verdade entram como novas ações na mesma função, disparadas por agendamento (`pg_cron`, como o relatório do WhatsApp). Exemplos:

- resumo do dia;
- carregador sem recarga;
- conta vencendo.
