# Conector Google Drive / Sheets - Obras EV

Este conector transforma o prototipo em um fluxo com banco real:

- obras criadas no site gravam na planilha em `OBRAS_EV`;
- cada obra tem ou cria uma subpasta dentro de `RELATORIOS BASE`;
- fotos, recibos e documentos enviados pelo site entram na pasta da obra;
- a base de prospeccao continua sendo lida da planilha `CONTROLE DE PROSPECÇÃO - ÁREAS EV`.

## Publicacao

1. Acesse `https://script.new` com a conta que tem acesso ao Drive.
2. Cole o conteudo de `Code.gs`.
3. Salve o projeto como `UBY Obras EV - API`.
4. Em `Implantar > Nova implantacao`, escolha `Aplicativo da Web`.
5. Execute como: `Eu`.
6. Quem pode acessar: `Qualquer pessoa com o link` ou `Qualquer pessoa com Conta Google`, conforme o nivel de seguranca desejado.
7. Copie a URL do aplicativo da Web.
8. Cole essa URL em `docs/obra-ev/drive_config.js`, no campo `APPS_SCRIPT_URL`.

Depois disso, o upload de arquivos na tela da obra passa a enviar os arquivos para a pasta correta no Google Drive.
