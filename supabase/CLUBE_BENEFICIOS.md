# Clube UBY: benefícios nos parceiros com QR fixo no balcão

Tudo roda dentro da plataforma, sem planilha:
- **Clientes:** qualquer pessoa que já recarregou nas estações UBY (`recharge_sessions`). A base se atualiza sozinha com as importações da Spott.
- **Top 3:** o ranking do **mês anterior fechado**, publicado pela tela Clube UBY → Ranking.
- **Parceiros e regras:** Clube UBY → Parceiros.
- **Usos:** gravados sozinhos em `club_partner_uses` e listados em Clube UBY → Parceiros.

| Quem | O que faz |
|---|---|
| Parceiro | Deixa o display no balcão. Olha a **tela verde** no celular do cliente (relógio andando, nome da loja) e aplica o desconto. |
| Cliente | Escaneia o QR. Na 1ª vez, informa o celular ou e-mail do app de recarga. No caixa, toca **USAR AGORA**. |
| UBY | Cadastra o parceiro e as regras, baixa o display e publica o Top 3 todo começo de mês. |

## Peças

- `supabase/clube_beneficios.sql`: cria as tabelas `club_partner_uses`, `club_devices` e `club_identify_attempts` e as funções `club_find_client` e `club_register_use`.
- `supabase/functions/clube-beneficio/index.ts`: função pública (sem JWT) chamada pela página do cliente.
- `docs/nova/beneficio.html`: página pública. Endereço: `https://p3solarenergy-hash.github.io/ubyrecharge/nova/beneficio.html?p=<código>`.
- `docs/nova/app/views/clube.js`: abas Ranking (publicar Top 3) e Parceiros (regras, QR, display, usos, cancelar).
- `scripts/test_clube_beneficio.mjs`: 16 cenários com dados fictícios (`node scripts/test_clube_beneficio.mjs`).

## Publicar (uma vez)

1. **Banco:** no Supabase, abra **SQL Editor**, cole todo o `supabase/clube_beneficios.sql` e clique em **Run**.
2. **Função:** no Supabase, abra **Edge Functions → Deploy a new function → Via Editor**.
   - Nome: `clube-beneficio`.
   - Cole o `supabase/functions/clube-beneficio/index.ts` e clique em **Deploy**.
   - Em **Details**, desligue **Enforce JWT verification** (a página do cliente não tem login).
   - Pela linha de comando, o equivalente é:
     ```bash
     npx supabase functions deploy clube-beneficio --no-verify-jwt --project-ref csxafzuaqbbsbdatuhrd
     ```
3. **Site:** publique os arquivos de `docs/nova` (commit + push na `master`). O GitHub Pages atualiza em 1 a 2 minutos.

## Usar

1. **Clube UBY → Ranking:** escolha o mês anterior (ex.: Setembro) e clique em **Publicar Top 3 para os parceiros**. O Top 3 vale durante o mês seguinte. Repita todo início de mês.
2. **Clube UBY → Parceiros → Editar:**
   - Situação **Ativo**.
   - Frase do display.
   - Regras. Exemplo do Muffatão:
     - "30% em alinhamento e balanceamento": quem = Top N do mês anterior, N = 3, limite 1 por dia, prioridade 2;
     - "10% em todos os serviços": quem = todos, limite 1 por dia, prioridade 1.
3. Clique em **Salvar** (o QR é criado na hora), depois em **⇩ Display**. Imprima em A5.
4. Teste com o seu celular, como cliente, antes de entregar ao parceiro.

**Tipos de regra:**
- `Todos que recarregaram`
- `Top N do mês anterior`
- `N primeiras vezes de cada cliente`
- `Lote de N usos`, para ações com quantidade limitada.

O limite (ex.: 1 por dia) é por cliente no parceiro, somando as regras. Um uso feito por engano é cancelado na lista de usos, e o cliente volta a poder usar.

## Limites conhecidos

- **Identificação:** só pelo celular ou e-mail do app de recarga. Quem souber o celular de outro cliente pode se passar por ele. Reduzem o abuso: o limite de uso, no máximo 2 celulares por cliente, o bloqueio após 5 erros e o nome do cliente na tela verde.
- **Clientes sem celular nem e-mail na Spott:** não conseguem se identificar. Confira a cobertura em Clube → Ranking ("Com telefone").
- **Estações consideradas UBY:** `malassise`, `posto-central-jk`, `ac-posto-central-jk`, `shopping-aurora` e `aurora-dc`, as mesmas do Painel UBY. Ao entrar uma estação nova, inclua o id em `UBY_WORK_IDS`, no topo da função.
