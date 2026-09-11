# Conector Google Drive / Sheets - Obras EV

Este conector transforma o prototipo em um fluxo com banco real:

- obras criadas no site gravam na planilha em `OBRAS_EV`;
- cada obra tem ou cria uma subpasta dentro de `RELATORIOS BASE`;
- fotos, recibos e documentos enviados pelo site entram na pasta da obra; contratos seguem para `Contratos/Concessionaria - Copel` ou `Contratos/Proprietario da area`;
- a base de prospeccao continua sendo lida da planilha `CONTROLE DE PROSPECÇÃO - ÁREAS EV`.

## Publicacao

1. Acesse `https://script.new` com a conta que tem acesso ao Drive.
2. Cole o conteudo de `Code.gs`.
3. Salve o projeto como `UBY Obras EV - API`.
4. Em `Configuracoes do projeto > Propriedades do script`, adicione `UBY_SUPABASE_URL` e `UBY_SUPABASE_PUBLISHABLE_KEY` com os valores publicos ja usados pela plataforma. O conector valida a sessao autenticada antes de aceitar qualquer upload.
5. Em `Implantar > Nova implantacao`, escolha `Aplicativo da Web`.
6. Execute como: `Eu`.
7. Quem pode acessar: `Qualquer pessoa`. A autorizacao do usuario e conferida pelo token de sessao UBY no proprio conector; nao use uma URL publica sem essa versao do `Code.gs`.
8. Copie a URL do aplicativo da Web.
9. Cole essa URL em `docs/obra-ev/drive_config.js`, no campo `APPS_SCRIPT_URL`.

Depois disso, o upload de arquivos na tela da obra passa a enviar os arquivos para a pasta correta no Google Drive.
