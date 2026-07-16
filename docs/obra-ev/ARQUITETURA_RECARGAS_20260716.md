# Arquitetura de dados das recargas

## Fonte oficial

- `obra_recargas_base`: base legada preservada durante a transicao, com arquivos, configuracoes e JSON completo por obra.
- `obra_recargas_historico`: versoes imutaveis criadas antes de alteracoes da base legada.
- `recharge_sessions`: uma linha por recarga, vinculada por chave estrangeira a `obras.id`.
- `recharge_monthly_summary`: resumo mensal calculado no banco.
- `recharge_daily_summary`: resumo diario calculado no banco.
- `recharge_customers`: cadastro geral paginado de clientes.
- `obra_finance_reports`: relatorios financeiros versionados e fechamentos preservados.

## Garantias aplicadas em 16/07/2026

1. Foi criado um backup `architecture_backup` das seis bases existentes antes da migracao.
2. As 357 sessoes foram migradas e conferidas por obra contra quantidade, kWh e receita da base legada.
3. A importacao grava primeiro as sessoes por uma funcao transacional. Uma falha desfaz toda a substituicao.
4. A base legada continua recebendo uma copia durante o periodo de transicao.
5. As tabelas usam RLS e so perfis autenticados com acesso ao app podem consultar ou alterar dados.
6. A interface usa paginas de no maximo 1.000 sessoes, resumos calculados no banco e cache IndexedDB.
7. Relatorios, clientes e detalhes deixam de bloquear a abertura do painel e carregam sob demanda.

## Recuperacao

Em uma divergencia, nao apagar nem editar manualmente a base atual. Comparar primeiro:

1. `recharge_sessions`;
2. `obra_recargas_base`;
3. a versao mais recente de `obra_recargas_historico` para a mesma `obra_id`.

Restauracoes devem gerar uma nova entrada de historico e manter a versao anterior. Nunca reutilizar dados de outra obra para preencher uma obra vazia.

## Proxima retirada da base legada

A copia JSON em `obra_recargas_base` so deve ser desativada depois de pelo menos dois fechamentos mensais conferidos na estrutura normalizada. Configuracoes operacionais devem ser movidas para tabela propria antes dessa retirada.
