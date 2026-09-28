/*
  Padrões da Nova Plataforma — um lugar só (27/09/2026).
  Os valores REAIS ficam na política salva na nuvem (Parâmetros e custos →
  Cotas, impostos e rodadas). Estes só entram quando a política ainda não tem
  o campo preenchido — e a tela de Parâmetros avisa quando isso acontece.
  Carregado na moldura (index.html), no motor (motor.html) e nos testes.
*/
(function (global) {
  "use strict";
  global.UBY_CONFIG = Object.freeze({
    quotaValueDefault: 80000,          // valor da cota da 1ª rodada (R$)
    distributionStartDefault: "2026-06" // primeira competência com distribuição aos cotistas
  });
})(typeof window !== "undefined" ? window : globalThis);
