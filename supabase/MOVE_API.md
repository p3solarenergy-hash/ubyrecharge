# Recargas da Move pela API (e índices públicos)

Na tela **Importar planilhas**, o botão **Buscar recargas da Move** traz o relatório de recargas do mês direto da Move, sem baixar arquivo. O relatório entra na **Importação automática (Spott e Move)** como se o arquivo tivesse sido arrastado: o mesmo leitor separa por estação e mês, acha a obra de cada estação, elimina duplicadas e guarda histórico para desfazer.

Junto entrou um índice público:

- **Bandeira tarifária (ANEEL)** em **Avisos → Outros avisos**: a bandeira do mês mais recente publicado e o adicional por 100 kWh. A API da ANEEL não aceita chamada direta do site, então passa pela função `uby-dados-publicos`.

## Peças

- `supabase/functions/uby-move/index.ts`: função chamada pela tela Importar com o login do usuário. Só atende quem já tem acesso às recargas (mesma regra de leitura de `obra_recargas_base`). Ações:
  - `status`: diz se os segredos da Move estão preenchidos (não mostra nenhum valor);
  - `report`: faz login na Move e baixa o relatório oficial de recargas (`POST /api/v1/report/xlsx/transactions`) do mês pedido.
- `supabase/functions/uby-dados-publicos/index.ts`: ação `bandeira` (ANEEL, dados abertos).
- `docs/nova/app/views/importar.js`: botão e conferências da busca da Move.
- `docs/nova/app/views/avisos.js`: aviso da bandeira tarifária.

## Publicar

As duas funções já foram publicadas no projeto `csxafzuaqbbsbdatuhrd` em 23/10/2026, com **Enforce JWT verification** ligado. Para publicar de novo depois de mudar o código:

```bash
npx supabase functions deploy uby-move uby-dados-publicos --project-ref csxafzuaqbbsbdatuhrd
```

O site (arquivos de `docs/nova`) entra no ar quando a mudança chega na `master`.

## Segredos da Move (o que falta)

No Supabase: **Edge Functions → Secrets → Add new secret**. Os valores ficam só no Supabase; nunca no site nem no GitHub.

| Segredo | O que é |
| --- | --- |
| `MOVE_API_BASE_URL` | Endereço da API de **produção** da Move, sem barra no fim. O endereço que aparece no código antigo (`https://cs-test.use-move.com`) é o ambiente de **teste** da Move; confirme o de produção com a Move. |
| `MOVE_API_KEY` | Api-Key fornecida pela Move. |
| `MOVE_API_USERNAME` | E-mail do usuário da Move que a plataforma vai usar. De preferência um usuário só para isso, **sem verificação em duas etapas** (a API não tem como responder o código). |
| `MOVE_API_PASSWORD` | Senha desse usuário. |
| `MOVE_API_PLATFORM` | Opcional. Padrão `DASHBOARD` (o mesmo do cliente antigo em Python). A Move também aceita `API`, se ela pedir. |

Assim que os quatro primeiros estiverem salvos, a tela Importar mostra **API da Move: conectada (endereço)**.

## Primeiro teste (faça antes de usar no dia a dia)

A busca pela API ainda não foi testada com a conta real da Move (não tínhamos as credenciais). Para conferir sem risco:

1. Abra **Importar planilhas**, escolha um **mês fechado que já foi importado pela planilha da Move** e clique em **Buscar recargas da Move**.
2. Confira a lista: as mesmas estações, quantidades, kWh e R$ da planilha que vocês baixam à mão.
3. Clique em **Importar**. O esperado é **sem novidade** em cada linha (a base já tem exatamente essas recargas).
4. Se aparecer "**outro horário de início**", nada foi gravado: a Move devolveu os horários em outro fuso. É só me avisar com a diferença de horas que aparece na mensagem.

Depois disso, use no mês em andamento quantas vezes quiser: o modo é sempre "Consolidar no mês", então recargas que já estão na base não duplicam.

## Como a busca funciona

- Pede à Move de um dia antes a um dia depois do mês (horário de Brasília), para nenhuma recarga se perder na virada por diferença de fuso. A tela fica só com as recargas do mês escolhido.
- Antes de gravar, compara cada Recarga(ID) que já está na base com o horário de início trazido pela API. Se algum for diferente, a estação não é importada. O motor reconhece recarga repetida pelo horário de início, e gravar com horário deslocado duplicaria as recargas.
- O token da Move é reaproveitado enquanto vale. A documentação da Move não diz se o token vai com "Bearer" ou sem; a função tenta os dois e guarda o que funcionou.

## Se não funcionar

- **"a função uby-move ainda não foi publicada no Supabase"**: rode o comando de publicar acima.
- **"falta configurar no Supabase: …"**: falta o segredo indicado.
- **"A Move recusou o login"**: confira usuário, senha e Api-Key. Se a mensagem citar a plataforma, troque `MOVE_API_PLATFORM` para `API`.
- **"A conta da Move pede verificação em duas etapas"**: peça à Move um usuário só para a API, sem essa verificação.
- **"A Move retornou HTTP 403/404 no relatório de recargas"**: o usuário não tem permissão de relatórios, ou o endereço de `MOVE_API_BASE_URL` não é o da API.
- **"não reconheci como relatório da Spott nem da Move"**: a planilha da API veio com colunas diferentes da baixada no painel. Mande o arquivo para ajustarmos o leitor.
