// Testes da função clube-beneficio com banco simulado em memória e dados fictícios.
// Rode: node scripts/test_clube_beneficio.mjs   (Node 23.6+ lê o .ts direto)
import assert from "node:assert";
import { handle, sp, samePeriod, normPhone, previousMonth, VALID_MIN } from "../supabase/functions/clube-beneficio/index.ts";

const QUA_MEIO_DIA = new Date("2026-10-14T15:00:00Z"); // 12:00 em Brasília

// Recargas fictícias nas estações UBY (o que club_find_client devolveria).
const SESSOES = [
  { client_name: "Ana Teste", client_phone: "65900000001", client_email: "ana@teste.dev" },
  { client_name: "Bruno Teste", client_phone: "65900000002", client_email: "" },
  { client_name: "Carla Teste", client_phone: "", client_email: "carla@teste.dev" },
  { client_name: "Davi Teste", client_phone: "65900000004", client_email: "" },
];

function clubeFicticio() {
  return {
    partners: [
      { id: "partner-r2", name: "R2 (teste)", status: "active", qrCode: "r2teste000",
        rules: [{ id: "r2-almoco", description: "10% no almoço", audience: "TODOS", period: "DIA", limit: 1, priority: 1, active: true }] },
      { id: "partner-muffatao", name: "Muffatão (teste)", status: "active", qrCode: "muf0000000",
        rules: [
          { id: "muf-top3", description: "30% alinhamento e balanceamento — Top 3", audience: "TOP_MES_ANTERIOR", n: 3, period: "DIA", limit: 1, priority: 2, active: true },
          { id: "muf-geral", description: "10% em todos os serviços", audience: "TODOS", period: "DIA", limit: 1, priority: 1, active: true }] },
      { id: "partner-bancouros", name: "Bancouros (teste)", status: "active", qrCode: "banc000000", benefit: "15% em qualquer peça" }, // sem regras: usa o padrão
      { id: "partner-lava", name: "Lava (teste)", status: "prospect", qrCode: "lava000000", benefit: "x" },
    ],
    partnerProgram: { topByMonth: { "2026-09": { entries: [
      { name: "Bruno Teste", phone: "(65) 90000-0002" }, { name: "Carla Teste", email: "CARLA@teste.dev" }, { name: "Eva Fora", phone: "65900000009" }] } } },
  };
}

// Banco simulado com a mesma semântica de club_register_use (SQL).
function bancoSimulado(clube, relogio) {
  const uses = [], devices = new Map(), attempts = new Map();
  return {
    uses, devices,
    club: async () => clube,
    findClient: async (phone, email) => SESSOES.find(s => (phone && s.client_phone && normPhone(s.client_phone) === phone) || (email && s.client_email === email)) || null,
    device: async h => { const d = devices.get(h); return d && d.status === "ATIVO" ? d : null; },
    addDevice: async row => { devices.set(row.token_hash, { ...row }); },
    devicesOf: async key => [...devices.values()].filter(d => d.client_key === key && d.status === "ATIVO").sort((a, b) => b.last_used_at.localeCompare(a.last_used_at) || -1),
    setDevice: async (h, f) => { Object.assign(devices.get(h), f); },
    attempts: async h => attempts.get(h) || null,
    setAttempts: async (h, failures, blocked_until) => { attempts.set(h, { failures, blocked_until }); },
    usesOf: async (pid, key) => uses.filter(u => u.partner_id === pid && u.client_key === key && u.status === "CONFIRMADO"),
    countBenefit: async (pid, bid) => uses.filter(u => u.partner_id === pid && u.benefit_id === bid && u.status === "CONFIRMADO").length,
    register: async a => {
      const now = relogio.agora, mine = uses.filter(u => u.partner_id === a.p_partner_id && u.client_key === a.p_client_key && u.status === "CONFIRMADO");
      const recent = mine.filter(u => now - new Date(u.created_at) < a.p_valid_minutes * 60000).at(-1);
      if (recent) return { ok: true, reused: true, use: recent };
      if (a.p_period !== "ILIMITADO" && mine.filter(u => samePeriod(u.created_at, a.p_period, now)).length >= a.p_limit) return { ok: false, reason: "limite" };
      if (a.p_lote != null && uses.filter(u => u.partner_id === a.p_partner_id && u.benefit_id === a.p_benefit_id && u.status === "CONFIRMADO").length >= a.p_lote) return { ok: false, reason: "esgotado" };
      const use = { id: String(uses.length + 1), created_at: now.toISOString(), partner_id: a.p_partner_id, benefit_id: a.p_benefit_id, description: a.p_description,
        client_key: a.p_client_key, client_name: a.p_client_name, code: String(1000 + uses.length), status: "CONFIRMADO" };
      uses.push(use);
      return { ok: true, reused: false, use };
    },
  };
}

function cenario() {
  const relogio = { agora: new Date(QUA_MEIO_DIA) };
  const db = bancoSimulado(clubeFicticio(), relogio);
  const chamar = body => handle(body, db, relogio.agora);
  const avancar = min => { relogio.agora = new Date(relogio.agora.getTime() + min * 60000); };
  const entrar = async id => { const r = await chamar({ acao: "identificar", identificador: id }); assert.ok(r.ok, r.mensagem); return r.aparelho; };
  return { db, chamar, avancar, entrar };
}

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log("  ok  " + nome); }
  catch (e) { falhas++; console.log("  FALHOU  " + nome + "\n        " + e.message); }
}

console.log("clube-beneficio — testes");

await caso("datas em São Paulo e mês anterior", async () => {
  assert.strictEqual(sp(new Date("2026-10-01T02:00:00Z")).date, "2026-09-30");
  assert.strictEqual(previousMonth(new Date("2026-01-10T15:00:00Z")), "2025-12");
  assert.strictEqual(previousMonth(QUA_MEIO_DIA), "2026-09");
});

await caso("telefone padronizado: DDD + 8 últimos dígitos, com ou sem 9, +55 ou 0", async () => {
  const mesmo = ["43 99658-0549", "43996580549", "043 99658-0549", "+55 (43) 99658-0549", "5543996580549", "43 9658-0549", "(043) 9658-0549"];
  mesmo.forEach(v => assert.strictEqual(normPhone(v), "4396580549", v));
  ["043 9456415", "4395413541561", "123", ""].forEach(v => assert.strictEqual(normPhone(v), "", v));
});

await caso("cliente cadastrado sem o 9 extra entra digitando com o 9 (e vice-versa)", async () => {
  const { chamar, entrar } = cenario();
  SESSOES.push({ client_name: "Edu Teste", client_phone: "43 9886-7800", client_email: "" });
  try {
    await entrar("(43) 99886-7800");
    assert.strictEqual((await chamar({ acao: "identificar", identificador: "4398867800" })).ok, true);
  } finally { SESSOES.pop(); }
});

await caso("vitrine: só parceiros ativos com QR e benefício", async () => {
  const { chamar } = cenario();
  const r = await chamar({ acao: "inicio" });
  assert.deepStrictEqual(r.vitrine.map(v => v.parceiro), ["R2 (teste)", "Muffatão (teste)", "Bancouros (teste)"]);
});

await caso("QR desconhecido ou de parceiro em negociação é recusado", async () => {
  const { chamar } = cenario();
  assert.strictEqual((await chamar({ acao: "inicio", p: "nada" })).ok, false);
  assert.strictEqual((await chamar({ acao: "inicio", p: "lava000000" })).ok, false);
});

await caso("antes de identificar, anuncia o benefício para todos (não o do Top 3)", async () => {
  const { chamar } = cenario();
  const r = await chamar({ acao: "inicio", p: "muf0000000" });
  assert.strictEqual(r.identificado, false);
  assert.strictEqual(r.destaque, "10% em todos os serviços");
});

await caso("identifica por celular em qualquer formato ou por e-mail; recusa quem nunca recarregou", async () => {
  const { chamar, entrar } = cenario();
  await entrar("+55 (65) 90000-0001");
  await entrar("CARLA@teste.dev");
  assert.strictEqual((await chamar({ acao: "identificar", identificador: "65911112222" })).ok, false);
  assert.strictEqual((await chamar({ acao: "identificar", identificador: "123" })).ok, false);
});

await caso("5 erros bloqueiam por 15 minutos", async () => {
  const { chamar, avancar } = cenario();
  for (let i = 0; i < 5; i++) await chamar({ acao: "identificar", identificador: "65911112222" });
  assert.match((await chamar({ acao: "identificar", identificador: "65911112222" })).mensagem, /Muitas tentativas/);
  avancar(16);
  assert.doesNotMatch((await chamar({ acao: "identificar", identificador: "65911112222" })).mensagem, /Muitas tentativas/);
});

await caso("R2: usa, toque duplo devolve a mesma tela, 2º no dia bloqueado, volta amanhã", async () => {
  const { chamar, entrar, avancar, db } = cenario();
  const ap = await entrar("65900000001");
  assert.strictEqual((await chamar({ acao: "inicio", p: "r2teste000", aparelho: ap })).beneficio.descricao, "10% no almoço");
  const u1 = await chamar({ acao: "usar", p: "r2teste000", aparelho: ap });
  const u2 = await chamar({ acao: "usar", p: "r2teste000", aparelho: ap });
  assert.strictEqual(u2.confirmacao.codigo, u1.confirmacao.codigo);
  assert.strictEqual(db.uses.length, 1);
  assert.strictEqual(u1.confirmacao.expiraEm - QUA_MEIO_DIA.getTime(), VALID_MIN * 60000);
  assert.ok((await chamar({ acao: "inicio", p: "r2teste000", aparelho: ap })).confirmacao, "reabrir mostra a tela verde");
  avancar(11);
  assert.match((await chamar({ acao: "inicio", p: "r2teste000", aparelho: ap })).mensagem, /hoje/);
  assert.strictEqual((await chamar({ acao: "usar", p: "r2teste000", aparelho: ap })).ok, false);
  avancar(24 * 60);
  assert.ok((await chamar({ acao: "usar", p: "r2teste000", aparelho: ap })).ok);
  assert.strictEqual(db.uses.length, 2);
});

await caso("Muffatão: Top 3 de setembro (por celular ou e-mail) ganha 30%; os demais 10%", async () => {
  const { chamar, entrar, db } = cenario();
  for (const id of ["65900000001", "65900000002", "carla@teste.dev", "65900000004"]) {
    await chamar({ acao: "usar", p: "muf0000000", aparelho: await entrar(id) });
  }
  assert.deepStrictEqual(db.uses.map(u => u.benefit_id), ["muf-geral", "muf-top3", "muf-top3", "muf-geral"]);
});

await caso("Top 3 muda sozinho na virada do mês (outubro usa o ranking de setembro; novembro, o de outubro)", async () => {
  const { chamar, entrar, avancar } = cenario();
  const bruno = await entrar("65900000002");
  avancar(18 * 24 * 60); // 01/11: Top 3 de outubro ainda não publicado
  assert.strictEqual((await chamar({ acao: "inicio", p: "muf0000000", aparelho: bruno })).beneficio.id, "muf-geral");
});

await caso("limite por dia soma os benefícios do parceiro (Top 3 não ganha 30% + 10% no mesmo dia)", async () => {
  const { chamar, entrar, avancar, db } = cenario();
  const ap = await entrar("65900000002");
  await chamar({ acao: "usar", p: "muf0000000", aparelho: ap });
  avancar(11);
  assert.strictEqual((await chamar({ acao: "usar", p: "muf0000000", aparelho: ap })).ok, false);
  assert.strictEqual(db.uses.length, 1);
});

await caso("parceiro sem regras usa o benefício geral, 1 por dia", async () => {
  const { chamar, entrar } = cenario();
  const r = await chamar({ acao: "usar", p: "banc000000", aparelho: await entrar("65900000004") });
  assert.strictEqual(r.confirmacao.descricao, "15% em qualquer peça");
});

await caso("LOTE e PRIMEIRAS_COMPRAS", async () => {
  const { chamar, entrar, avancar, db } = cenario();
  const club = await db.club();
  club.partners[0].rules.push({ id: "r2-acao", description: "Sobremesa grátis (ação)", audience: "LOTE", n: 1, period: "DIA", limit: 1, priority: 9, active: true });
  club.partners[2].rules = [
    { id: "b-boas", description: "25% na primeira compra", audience: "PRIMEIRAS_COMPRAS", n: 1, period: "ILIMITADO", priority: 9, active: true },
    { id: "b-geral", description: "15% em qualquer peça", audience: "TODOS", period: "MES", limit: 3, priority: 1, active: true }];
  const a = await entrar("65900000001"), b = await entrar("65900000004");
  assert.strictEqual((await chamar({ acao: "usar", p: "r2teste000", aparelho: a })).confirmacao.descricao, "Sobremesa grátis (ação)");
  assert.strictEqual((await chamar({ acao: "usar", p: "r2teste000", aparelho: b })).confirmacao.descricao, "10% no almoço");
  assert.strictEqual((await chamar({ acao: "usar", p: "banc000000", aparelho: a })).confirmacao.descricao, "25% na primeira compra");
  avancar(11);
  assert.strictEqual((await chamar({ acao: "usar", p: "banc000000", aparelho: a })).confirmacao.descricao, "15% em qualquer peça");
});

await caso("regra fora da vigência ou desligada não vale", async () => {
  const { chamar, entrar, db } = cenario();
  const club = await db.club();
  club.partners[0].rules[0].end = "01/10/2026";
  const r = await chamar({ acao: "inicio", p: "r2teste000", aparelho: await entrar("65900000001") });
  assert.ok(!r.beneficio);
});

await caso("no máximo 2 celulares por cliente; o mais antigo sai", async () => {
  const { chamar, entrar, avancar } = cenario();
  const a1 = await entrar("65900000001"); avancar(1);
  const a2 = await entrar("65900000001"); avancar(1);
  const a3 = await entrar("ana@teste.dev");   // mesmo cliente pelo e-mail → mesma chave (celular)
  assert.strictEqual((await chamar({ acao: "inicio", p: "r2teste000", aparelho: a1 })).identificado, false);
  assert.strictEqual((await chamar({ acao: "inicio", p: "r2teste000", aparelho: a2 })).identificado, true);
  assert.strictEqual((await chamar({ acao: "inicio", p: "r2teste000", aparelho: a3 })).identificado, true);
});

await caso("trocar cadastro desliga o celular; token inválido pede nova identificação", async () => {
  const { chamar, entrar } = cenario();
  const ap = await entrar("65900000001");
  await chamar({ acao: "esquecer", aparelho: ap });
  assert.strictEqual((await chamar({ acao: "inicio", p: "r2teste000", aparelho: ap })).identificado, false);
  assert.strictEqual((await chamar({ acao: "usar", p: "r2teste000", aparelho: "x".repeat(64) })).reidentificar, true);
});

await caso("uso CANCELADO pela equipe libera de novo", async () => {
  const { chamar, entrar, avancar, db } = cenario();
  const ap = await entrar("65900000001");
  await chamar({ acao: "usar", p: "r2teste000", aparelho: ap }); avancar(11);
  db.uses[0].status = "CANCELADO";
  assert.ok((await chamar({ acao: "usar", p: "r2teste000", aparelho: ap })).ok);
});

console.log(falhas ? `\n${falhas} teste(s) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
