/* NOVA PLATAFORMA — campos do carregador em Parâmetros (dado fixo).
   Gerado por ferramentas/extrair-campos.js a partir do formulário antigo, uma única vez. */
window.UBY_CAMPOS_FINANCEIROS = [
 {
  "key": "operationModel",
  "format": "model",
  "id": "",
  "models": null,
  "group": "Operacao",
  "name": "Modelo de faturamento",
  "rule": "Define a titularidade do ativo e quem recebe o resultado. O parceiro com gestao P3 e royalty UBY fica fora dos custos e da distribuicao da matriz.",
  "controls": [
   {
    "id": "financeOperationModel",
    "tag": "SELECT",
    "type": "select-one",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": [
     {
      "value": "uby",
      "text": "Ativo UBY - operacao e investidores UBY"
     },
     {
      "value": "p3_society",
      "text": "Ativo P3 em parceria - lucro liquido dividido"
     },
     {
      "value": "hybrid",
      "text": "Ativo UBY hibrido AC/DC"
     },
     {
      "value": "management_only",
      "text": "Gestao P3 - ativo do parceiro, sem UBY"
     },
     {
      "value": "third_party_management",
      "text": "Parceiro - gestao P3 + royalty UBY (fora da matriz)"
     }
    ]
   }
  ]
 },
 {
  "key": "managementPct",
  "format": "pct",
  "id": "",
  "models": null,
  "group": "Gestao",
  "name": "Gestao P3",
  "rule": "Percentual sobre o faturamento total: recargas, ociosidade e demais receitas reconhecidas.",
  "controls": [
   {
    "id": "financeMgmtPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "ubyRoyaltyPct",
  "format": "pct",
  "id": "",
  "models": "third_party_management",
  "group": "Marca",
  "name": "Royalty de marca UBY",
  "rule": "Percentual sobre o faturamento, separado da gestao P3 e da plataforma",
  "controls": [
   {
    "id": "financeUbyRoyaltyPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "taxRatePct",
  "format": "pct",
  "id": "",
  "models": "legacy_tax",
  "group": "Tributacao",
  "name": "Tributo por carregador — histórico",
  "rule": "Configuração preservada apenas para competências já cadastradas. Novos tributos devem ser lançados na Central Financeira, com destinos e rateio definidos.",
  "controls": [
   {
    "id": "financeTaxRatePct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.01",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "p3SocietyPct",
  "format": "pct",
  "id": "",
  "models": "p3_society",
  "group": "Sociedade",
  "name": "Participacao P3 na parceria",
  "rule": "Percentual do investimento e do lucro liquido. Use 100% se o ativo P3 nao tiver socio.",
  "controls": [
   {
    "id": "financeP3SocietyPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "p3AcEquityPct",
  "format": "pct",
  "id": "",
  "models": "hybrid",
  "group": "Sociedade",
  "name": "Sociedade P3 em AC",
  "rule": "Percentual aplicado a operacao AC",
  "controls": [
   {
    "id": "financeP3AcEquityPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "p3DcEquityPct",
  "format": "pct",
  "id": "",
  "models": "hybrid",
  "group": "Sociedade",
  "name": "Sociedade P3 em DC",
  "rule": "Percentual aplicado a operacao DC",
  "controls": [
   {
    "id": "financeP3DcEquityPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "platformPct",
  "format": "pct",
  "id": "",
  "models": null,
  "group": "Plataforma",
  "name": "App / plataforma de terceiros",
  "rule": "Retencao somente sobre receitas operacionais importadas: recargas e ociosidade. Nao incide sobre marketing, publicidade, patrocinios ou parcerias.",
  "controls": [
   {
    "id": "financePlatformPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "energyCostPerKWh",
  "format": "brl_kwh",
  "id": "",
  "models": null,
  "group": "Energia",
  "name": "Composição mensal de energia",
  "rule": "Selecione o modelo e informe os dados da fatura deste mês. Copel e arrendamento formam um único custo de energia no resultado mensal.",
  "controls": [
   {
    "id": "financeEnergyMode",
    "tag": "SELECT",
    "type": "select-one",
    "placeholder": "",
    "label": "MODELO DE COBRANÇA",
    "leaseOnly": false,
    "options": [
     {
      "value": "copel",
      "text": "Somente Copel"
     },
     {
      "value": "copel_lease",
      "text": "Copel + arrendamento"
     }
    ]
   },
   {
    "id": "financeCopelAmount",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "",
    "step": "0.01",
    "placeholder": "Ex.: 1250,50",
    "label": "VALOR DA FATURA COPEL (R$)",
    "leaseOnly": false,
    "options": []
   },
   {
    "id": "financeCopelKWh",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "",
    "step": "0.01",
    "placeholder": "Ex.: 1300",
    "label": "KWH DA FATURA COPEL",
    "leaseOnly": false,
    "options": []
   },
   {
    "id": "financeCopelDueDay",
    "tag": "INPUT",
    "type": "number",
    "min": "1",
    "max": "31",
    "step": "1",
    "placeholder": "Ex.: 25",
    "label": "VENCIMENTO COPEL (DIA)",
    "leaseOnly": false,
    "options": []
   },
   {
    "id": "financeLeaseCreditedKWh",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "",
    "step": "0.01",
    "placeholder": "Ex.: 10000",
    "label": "CRÉDITOS ABATIDOS (KWH)",
    "leaseOnly": true,
    "options": []
   },
   {
    "id": "financeLeaseRate",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "",
    "step": "0.0001",
    "placeholder": "Ex.: 0,08",
    "label": "PREÇO DO ARRENDAMENTO (R$/KWH)",
    "leaseOnly": true,
    "options": []
   },
   {
    "id": "financeLeaseDueDay",
    "tag": "INPUT",
    "type": "number",
    "min": "1",
    "max": "31",
    "step": "1",
    "placeholder": "Ex.: 10",
    "label": "VENCIMENTO ARRENDAMENTO (DIA)",
    "leaseOnly": true,
    "options": []
   }
  ]
 },
 {
  "key": "investmentValue",
  "format": "brl",
  "id": "",
  "models": null,
  "group": "Capital",
  "name": "Investimento no ponto",
  "rule": "Base para ROI e payback",
  "controls": [
   {
    "id": "financeInvestmentValue",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "",
    "step": "100",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "investorQuotaPct",
  "format": "pct",
  "id": "",
  "models": "uby hybrid",
  "group": "Investidores",
  "name": "Cotas dos investidores",
  "rule": "Percentual distribuivel aos cotistas",
  "controls": [
   {
    "id": "financeInvestorQuotaPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "saRetentionPct",
  "format": "pct",
  "id": "",
  "models": "legacy_reserve",
  "group": "Retencao",
  "name": "Retenção S.A. por carregador — histórico",
  "rule": "Configuração preservada para leitura de competências já salvas. Reserva legal e expansão passam a ser tratadas no fechamento consolidado da UBY.",
  "controls": [
   {
    "id": "financeSaRetentionPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "targetOccPct",
  "format": "pct",
  "id": "",
  "models": null,
  "group": "Meta",
  "name": "Objetivo de ocupacao",
  "rule": "Meta mensal de utilizacao",
  "controls": [
   {
    "id": "financeTargetOccPct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "targetRevenuePerKWh",
  "format": "brl_kwh",
  "id": "",
  "models": null,
  "group": "Meta",
  "name": "Preco objetivo",
  "rule": "Zero usa o preco medio real",
  "controls": [
   {
    "id": "financeTargetRevenuePerKWh",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "",
    "step": "0.01",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "ownerEnergyRate",
  "format": "brl_kwh",
  "id": "",
  "models": null,
  "group": "Parceiro",
  "name": "Energia para reembolso",
  "rule": "Inicia igual ao custo da energia; pode ser ajustado",
  "controls": [
   {
    "id": "ownerEnergyRate",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "",
    "step": "0.01",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "ownerTransferMode",
  "format": "transfer",
  "id": "",
  "models": null,
  "group": "Parceiro",
  "name": "Percentual da area",
  "rule": "Sempre aplicado sobre o faturamento total. A opcao legada apenas identifica qual percentual cadastrado deve ser preservado.",
  "controls": [
   {
    "id": "ownerTransferMode",
    "tag": "SELECT",
    "type": "select-one",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": [
     {
      "value": "gross",
      "text": "Percentual sobre faturamento total"
     },
     {
      "value": "net",
      "text": "Percentual legado sobre faturamento total"
     }
    ]
   }
  ]
 },
 {
  "key": "ownerRevenueSharePct",
  "format": "pct",
  "id": "ownerRevenueShareRow",
  "models": null,
  "group": "Parceiro",
  "name": "Participacao da area",
  "rule": "Percentual sobre o faturamento total, incluindo receitas extras.",
  "controls": [
   {
    "id": "ownerRevenueSharePct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 },
 {
  "key": "ownerNetProfitSharePct",
  "format": "pct",
  "id": "ownerNetProfitShareRow",
  "models": null,
  "group": "Parceiro",
  "name": "Participacao da area (legado)",
  "rule": "Percentual preservado e aplicado sobre o faturamento total, incluindo receitas extras.",
  "controls": [
   {
    "id": "ownerNetProfitSharePct",
    "tag": "INPUT",
    "type": "number",
    "min": "0",
    "max": "100",
    "step": "0.1",
    "placeholder": "",
    "label": "",
    "leaseOnly": false,
    "options": []
   }
  ]
 }
];
