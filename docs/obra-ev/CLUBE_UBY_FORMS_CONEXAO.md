# Conexao do Forms do Clube UBY

## Planilha conectada

- Forms: https://docs.google.com/forms/d/1OqvX0LKcrdKe8VPvkrSX6fxGhM0T1JZNExfuCHRddvM/edit#responses
- Planilha: Cadastro Clube UBY (respostas)
- ID: `19iPeYks-8P0Fd3henDoTYFPN5hQ6dconJgsQOl30Qws`
- Aba: `Respostas ao formulario 1`
- GID: `1124525277`
- Apps Script: https://script.google.com/home/projects/1mkAvRkHSO-f8mM04vUat2W3xhrkd50Jn-6N411GcF6C83HrUm3NakBbR/edit
- Endpoint publicado: https://script.google.com/macros/s/AKfycbyyK0lC1ZEVr_USQ_uqzi55sIWsqrxF-hvKAjc8SbBv_Qr8195xN3o6YrFkgKj7eQDr/exec

## Publicar o conector seguro

1. Abra o Forms acima em `Respostas` e clique no icone verde do Google Sheets para abrir/criar a planilha de respostas.
2. Va em `Extensoes` > `Apps Script`.
3. Cole o conteudo do arquivo `clube_uby_form_proxy.gs`.
4. Salve o projeto como `Clube UBY - API Forms`.
5. Clique em `Implantar` > `Nova implantacao`.
6. Escolha o tipo `Aplicativo da Web`.
7. Configure:
   - Executar como: `Eu`
   - Quem pode acessar: `Qualquer pessoa com o link`
8. Clique em `Implantar` e autorize a leitura da planilha.
9. Copie a URL terminada em `/exec`.

## Conectar no app

Opcao 1 - permanente no codigo:

1. Abra `clube_uby_config.js`.
2. Cole a URL `/exec` em `window.UBY_CLUBE_FORM_ENDPOINT`.
3. Salve, publique no GitHub e abra `Recargas > Clube UBY > Sincronizar formulario`.

Opcao 2 - local no navegador:

1. Abra `Recargas > Clube UBY`.
2. Clique em `Configurar endpoint`.
3. Cole a URL `/exec`.
4. Clique em `Sincronizar formulario`.

## Campos lidos pelo app

- Carimbo de data/hora
- Pontuacao
- Nome completo
- WhatsApp com DDD
- E-mail
- Marca do veiculo
- Modelo do veiculo
- Placa do veiculo
- Atrativo principal do Clube UBY
- Beneficio desejado
- Interesse no ranking mensal
- Regioes de interesse
- Indicacao de ponto UBY
- Local ou contato indicado
- Regulamento e participacao
- Autorizacao LGPD

## Como testar

Abra a URL `/exec` no navegador. A resposta esperada com sucesso e um JSON parecido com:

```json
{
  "ok": true,
  "source": "Apps Script seguro - Clube UBY",
  "total": 1,
  "participants": []
}
```

Depois teste no app pelo botao `Sincronizar formulario`.

## Como o app cruza os dados

O app salva as respostas do Forms na base local do Clube UBY e cruza cada cadastro com o ranking por:

1. E-mail
2. WhatsApp/telefone
3. Nome normalizado

Quando encontra correspondencia, o ranking passa a mostrar telefone, status do cadastro, LGPD, veiculo, placa e beneficio desejado junto dos pontos/faturamento.
