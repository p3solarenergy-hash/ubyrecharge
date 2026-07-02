# Conexao do Forms do Clube UBY

## Planilha conectada

- Planilha: Cadastro Clube UBY (respostas)
- ID: `19iPeYks-8P0Fd3henDoTYFPN5hQ6dconJgsQOl30Qws`
- Aba: `Respostas ao formulario 1`
- GID: `1124525277`

## Publicar o conector seguro

1. Abra a planilha de respostas do Forms.
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
