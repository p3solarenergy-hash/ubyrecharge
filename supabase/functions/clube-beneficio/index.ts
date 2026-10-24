// Clube UBY — benefícios nos parceiros com QR fixo no balcão.
// Página pública: nova/beneficio.html?p=<código do parceiro>. Sem login do parceiro.
// O cliente se identifica uma vez por celular (ou e-mail do app de recarga) e precisa
// ter recarregado numa estação UBY. Parceiros, regras e o Top 3 do mês anterior vêm da
// linha "club-uby" (tela Clube UBY); os usos ficam em club_partner_uses.

// Mesmos ativos do Painel UBY (uby-financial-daily-export).
export const UBY_WORK_IDS = ["malassise", "posto-central-jk", "ac-posto-central-jk", "shopping-aurora", "aurora-dc"];
export const VALID_MIN = 10;      // minutos em que a tela verde vale no caixa
const MAX_DEVICES = 2;            // celulares lembrados por cliente
const MAX_FAILS = 5;              // erros de identificação antes do bloqueio
const BLOCK_MIN = 15;
const TZ = "America/Sao_Paulo";
const CLUB_DOC_ID = "club-uby";

export type Rule = {
  id: string; description: string; audience: string; n?: number;
  period?: string; limit?: number; priority?: number; active?: boolean; start?: string; end?: string;
};
export type Client = { key: string; name: string; phone: string; email: string };
export type Use = { id?: string; created_at: string; partner_id: string; benefit_id: string; description: string; client_key: string; client_name?: string; code: string; status?: string };

// ───────────── utilidades puras (testadas em scripts/test_clube_beneficio.mjs) ─────────────

/**
 * Chave do celular: DDD + 8 últimos dígitos. Cada cadastro vem num formato
 * ("043 9965-8054", "+55 43 99965-8054", "43999658054"): ignora +55, zeros à
 * esquerda e o 9 extra, que às vezes falta. Número com dígitos a menos ou a
 * mais não tem como ser adivinhado e fica vazio (o cliente usa o e-mail).
 * A mesma regra está em club_find_client (SQL).
 */
export function normPhone(v: unknown): string {
  let d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2).replace(/^0+/, "");
  if (d.length < 10 || d.length > 11) return "";
  return d.slice(0, 2) + d.slice(-8);
}
export function normEmail(v: unknown): string {
  const e = String(v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}
export function parseIdentifier(v: unknown): { phone: string; email: string } {
  const raw = String(v ?? "").trim();
  return raw.includes("@") ? { phone: "", email: normEmail(raw) } : { phone: normPhone(raw), email: "" };
}
export function clientKey(phone: string, email: string): string {
  return phone ? `tel:${phone}` : `mail:${email}`;
}
export function firstName(v: unknown): string {
  return String(v ?? "").trim().split(/\s+/)[0] || "Cliente";
}

/** Data/hora em São Paulo: { date: "2026-10-15", month: "2026-10", hm: "dd/MM HH:mm" }. */
export function sp(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const p = (t: string) => parts.find(x => x.type === t)?.value || "00";
  const hour = p("hour") === "24" ? "00" : p("hour");
  return { date: `${p("year")}-${p("month")}-${p("day")}`, month: `${p("year")}-${p("month")}`, hm: `${p("day")}/${p("month")} ${hour}:${p("minute")}` };
}
export function previousMonth(now: Date): string {
  const [y, m] = sp(now).month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function mondayOf(dateKey: string): string {
  const t = new Date(`${dateKey}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
export function samePeriod(createdAt: string, period: string, now: Date): boolean {
  const a = sp(new Date(createdAt)), b = sp(now);
  if (period === "TOTAL") return true;
  if (period === "DIA") return a.date === b.date;
  if (period === "MES") return a.month === b.month;
  if (period === "SEMANA") return mondayOf(a.date) === mondayOf(b.date);
  return true; // período desconhecido conta todo o histórico (falha fechada)
}
function dateKey(v: unknown): string {
  const x = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(x)) return x.slice(0, 10);
  const m = x.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Regras do parceiro. Sem regras cadastradas: o benefício geral vale para todos, 1 vez por dia. */
export function partnerRules(partner: any): Rule[] {
  if (Array.isArray(partner?.rules) && partner.rules.length) return partner.rules;
  const text = String(partner?.benefitShort || partner?.benefit || "").trim();
  return text ? [{ id: "geral", description: text, audience: "TODOS", period: "DIA", limit: 1, priority: 1, active: true }] : [];
}
export function activeRules(partner: any, now: Date): Rule[] {
  const today = sp(now).date;
  return partnerRules(partner)
    .filter(r => r && r.active !== false && r.description && (!dateKey(r.start) || dateKey(r.start) <= today) && (!dateKey(r.end) || dateKey(r.end) >= today))
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
}
export function isTop(client: Client, entries: any[], n: number): boolean {
  return (entries || []).slice(0, n).some(e =>
    (client.phone && normPhone(e?.phone) === client.phone) || (client.email && normEmail(e?.email) === client.email));
}

/**
 * Escolhe o melhor benefício disponível agora. audience:
 *   TODOS              qualquer cliente que recarregou na rede UBY
 *   TOP_MES_ANTERIOR   os N primeiros do ranking do mês anterior (publicado na tela Clube)
 *   PRIMEIRAS_COMPRAS  as N primeiras utilizações deste benefício por cliente
 *   LOTE               N utilizações no total (ação com quantidade limitada)
 * period/limit valem por cliente neste parceiro somando todos os benefícios (ex.: DIA/1).
 */
export function chooseBenefit(rules: Rule[], client: Client, top: any[], myUses: Use[], loteTotals: Record<string, number>, now: Date):
  { rule: Rule } | { rule: null; message: string } {
  let blockedBy = "";
  for (const r of rules) {
    const n = Number(r.n) || 0, audience = String(r.audience || "TODOS").toUpperCase();
    if (audience === "TOP_MES_ANTERIOR") { if (!isTop(client, top, n || 3)) continue; }
    else if (audience === "PRIMEIRAS_COMPRAS") { if (myUses.filter(u => u.benefit_id === r.id).length >= n) continue; }
    else if (audience === "LOTE") { if ((loteTotals[r.id] || 0) >= n) continue; }
    else if (audience !== "TODOS") continue;
    const period = String(r.period || "DIA").toUpperCase(), limit = Number(r.limit);
    if (period !== "ILIMITADO") {
      const used = myUses.filter(u => samePeriod(u.created_at, period, now)).length;
      if (!(limit > 0) || used >= limit) { blockedBy = blockedBy || period; continue; }
    }
    return { rule: r };
  }
  if (blockedBy) {
    const when: Record<string, string> = { DIA: "hoje. Volte amanhã!", SEMANA: "nesta semana.", MES: "neste mês.", TOTAL: "aqui." };
    return { rule: null, message: `Você já usou seu benefício ${when[blockedBy] || "aqui."}` };
  }
  return { rule: null, message: "Nenhum benefício disponível para você neste parceiro no momento." };
}

export function confirmation(use: Use) {
  const t = new Date(use.created_at).getTime();
  return { descricao: use.description, codigo: use.code, nome: firstName(use.client_name), horario: sp(new Date(t)).hm, expiraEm: t + VALID_MIN * 60000 };
}

export async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ───────────── acesso ao banco (trocado por um simulador nos testes) ─────────────

export interface Db {
  club(): Promise<any>;
  findClient(phone: string, email: string): Promise<{ client_name: string | null; client_phone: string | null; client_email: string | null } | null>;
  device(hash: string): Promise<any | null>;
  addDevice(row: any): Promise<void>;
  devicesOf(key: string): Promise<any[]>;            // ativos, mais recentes primeiro
  setDevice(hash: string, fields: any): Promise<void>;
  attempts(hash: string): Promise<{ failures: number; blocked_until: string | null } | null>;
  setAttempts(hash: string, failures: number, blockedUntil: string | null): Promise<void>;
  usesOf(partnerId: string, key: string): Promise<Use[]>;   // confirmados
  countBenefit(partnerId: string, benefitId: string): Promise<number>;
  register(args: Record<string, unknown>): Promise<{ ok: boolean; reused?: boolean; reason?: string; use?: Use }>;
}

async function supabaseDb(): Promise<Db> {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  // @ts-ignore Deno
  const env = (k: string) => Deno.env.get(k)!;
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const must = (r: any) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    club: async () => must(await sb.from("uby_financial_matrix").select("payload").eq("id", CLUB_DOC_ID).maybeSingle())?.payload || {},
    findClient: async (phone, email) => (must(await sb.rpc("club_find_client", { p_phone: phone, p_email: email, p_work_ids: UBY_WORK_IDS })) || [])[0] || null,
    device: async hash => must(await sb.from("club_devices").select("*").eq("token_hash", hash).eq("status", "ATIVO").maybeSingle()),
    addDevice: async row => { must(await sb.from("club_devices").insert(row)); },
    devicesOf: async key => must(await sb.from("club_devices").select("token_hash,last_used_at").eq("client_key", key).eq("status", "ATIVO").order("last_used_at", { ascending: false })) || [],
    setDevice: async (hash, fields) => { must(await sb.from("club_devices").update(fields).eq("token_hash", hash)); },
    attempts: async hash => must(await sb.from("club_identify_attempts").select("failures,blocked_until").eq("identifier_hash", hash).maybeSingle()),
    setAttempts: async (hash, failures, blockedUntil) => { must(await sb.from("club_identify_attempts").upsert({ identifier_hash: hash, failures, blocked_until: blockedUntil, updated_at: new Date().toISOString() })); },
    usesOf: async (pid, key) => must(await sb.from("club_partner_uses").select("*").eq("partner_id", pid).eq("client_key", key).eq("status", "CONFIRMADO").order("created_at")) || [],
    countBenefit: async (pid, bid) => { const r = await sb.from("club_partner_uses").select("id", { count: "exact", head: true }).eq("partner_id", pid).eq("benefit_id", bid).eq("status", "CONFIRMADO"); if (r.error) throw new Error(r.error.message); return r.count || 0; },
    register: async args => must(await sb.rpc("club_register_use", args)),
  };
}

// ───────────── regras de atendimento ─────────────

function partnerByCode(club: any, code: string) {
  const c = String(code || "").trim();
  if (!c) return null;
  return (club.partners || []).find((p: any) => String(p.qrCode || "") === c && p.status === "active") || null;
}
function topEntries(club: any, now: Date): any[] {
  return club?.partnerProgram?.topByMonth?.[previousMonth(now)]?.entries || [];
}
async function clientOf(db: Db, token: unknown): Promise<{ client: Client; hash: string } | null> {
  const t = String(token || "");
  if (t.length < 32 || t.length > 128) return null;
  const hash = await sha256(t);
  const d = await db.device(hash);
  if (!d) return null;
  return { hash, client: { key: d.client_key, name: d.client_name || "", phone: d.client_phone || "", email: d.client_email || "" } };
}
async function evaluate(db: Db, partner: any, client: Client, club: any, now: Date) {
  const rules = activeRules(partner, now);
  const myUses = await db.usesOf(partner.id, client.key);
  const lote: Record<string, number> = {};
  for (const r of rules) if (String(r.audience).toUpperCase() === "LOTE") lote[r.id] = await db.countBenefit(partner.id, r.id);
  return { rules, myUses, choice: chooseBenefit(rules, client, topEntries(club, now), myUses, lote, now) };
}
function recentUse(uses: Use[], now: Date): Use | null {
  const u = uses.filter(x => now.getTime() - new Date(x.created_at).getTime() < VALID_MIN * 60000).at(-1);
  return u || null;
}

export async function handle(body: any, db: Db, now = new Date()): Promise<Record<string, unknown>> {
  const acao = String(body?.acao || "");
  const club = await db.club();

  if (acao === "inicio") {
    const base = { ok: true, agora: now.getTime() };
    if (!body.p) {
      const vitrine = (club.partners || []).filter((p: any) => p.status === "active" && p.qrCode)
        .map((p: any) => ({ parceiro: p.name, logo: p.logo || "", beneficios: activeRules(p, now).map(r => r.description) }))
        .filter((v: any) => v.beneficios.length);
      return { ...base, vitrine };
    }
    const partner = partnerByCode(club, body.p);
    if (!partner) return { ok: false, mensagem: "QR Code não reconhecido. Peça ajuda ao atendente." };
    const rules = activeRules(partner, now);
    const aberto = rules.find(r => String(r.audience || "TODOS").toUpperCase() === "TODOS") || rules[0];
    const res: Record<string, unknown> = { ...base, parceiro: partner.name, logo: partner.logo || "", destaque: aberto?.description || "" };
    const me = await clientOf(db, body.aparelho);
    if (!me) return { ...res, identificado: false };
    const ev = await evaluate(db, partner, me.client, club, now);
    const recent = recentUse(ev.myUses, now);
    const out = { ...res, identificado: true, nome: firstName(me.client.name) };
    if (recent) return { ...out, confirmacao: confirmation(recent) };
    return ev.choice.rule
      ? { ...out, beneficio: { id: ev.choice.rule.id, descricao: ev.choice.rule.description } }
      : { ...out, mensagem: ev.choice.message };
  }

  if (acao === "identificar") {
    const id = parseIdentifier(body.identificador);
    if (!id.phone && !id.email) return { ok: false, mensagem: "Informe o celular com DDD ou o e-mail usado no app de recarga." };
    const idHash = await sha256(`id:${id.phone || id.email}`);
    const tries = await db.attempts(idHash);
    if (tries?.blocked_until && new Date(tries.blocked_until) > now) return { ok: false, mensagem: `Muitas tentativas. Aguarde ${BLOCK_MIN} minutos.` };
    const found = await db.findClient(id.phone, id.email);
    if (!found) {
      const fails = (tries?.failures || 0) + 1;
      await db.setAttempts(idHash, fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? new Date(now.getTime() + BLOCK_MIN * 60000).toISOString() : null);
      return { ok: false, mensagem: "Não encontramos recargas UBY com esse dado. Use o mesmo celular ou e-mail cadastrado no app de recarga." };
    }
    if (tries) await db.setAttempts(idHash, 0, null);
    const phone = normPhone(found.client_phone) || id.phone, email = normEmail(found.client_email) || id.email;
    const key = clientKey(phone, email);
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const stamp = now.toISOString();
    await db.addDevice({ token_hash: await sha256(token), client_key: key, client_phone: phone, client_email: email, client_name: found.client_name || "", status: "ATIVO", created_at: stamp, last_used_at: stamp });
    // Mantém só os celulares mais recentes do cliente (desestimula emprestar o cadastro).
    const mine = await db.devicesOf(key);
    for (const d of mine.slice(MAX_DEVICES)) await db.setDevice(d.token_hash, { status: "SUBSTITUIDO" });
    return { ok: true, aparelho: token };
  }

  if (acao === "usar") {
    const partner = partnerByCode(club, body.p);
    if (!partner) return { ok: false, mensagem: "QR Code não reconhecido." };
    const me = await clientOf(db, body.aparelho);
    if (!me) return { ok: false, reidentificar: true, mensagem: "Identifique-se novamente." };
    const ev = await evaluate(db, partner, me.client, club, now);
    const recent = recentUse(ev.myUses, now);
    if (recent) return { ok: true, confirmacao: confirmation(recent), agora: now.getTime() };
    if (!ev.choice.rule) return { ok: false, mensagem: ev.choice.message };
    const r = ev.choice.rule, audience = String(r.audience || "TODOS").toUpperCase();
    const result = await db.register({
      p_partner_id: partner.id, p_benefit_id: r.id, p_description: r.description, p_client_key: me.client.key, p_client_name: me.client.name,
      p_period: String(r.period || "DIA").toUpperCase(), p_limit: Number(r.limit) || 0, p_lote: audience === "LOTE" ? Number(r.n) || 0 : null, p_valid_minutes: VALID_MIN,
    });
    if (!result.ok || !result.use) return { ok: false, mensagem: result.reason === "esgotado" ? "Este benefício esgotou." : "Você já usou seu benefício neste período." };
    await db.setDevice(me.hash, { last_used_at: now.toISOString() });
    return { ok: true, confirmacao: confirmation(result.use), agora: now.getTime() };
  }

  if (acao === "esquecer") {
    const me = await clientOf(db, body.aparelho);
    if (me) await db.setDevice(me.hash, { status: "ENCERRADO" });
    return { ok: true };
  }

  return { ok: false, mensagem: "Ação inválida." };
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };

// @ts-ignore Deno (fora do Deno, o arquivo só exporta as funções para teste)
if (typeof Deno !== "undefined") {
  let dbPromise: Promise<Db> | null = null;
  // @ts-ignore Deno
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return new Response("Método não permitido", { status: 405, headers: CORS });
    try {
      const body = await req.json().catch(() => ({}));
      dbPromise ??= supabaseDb();
      const out = await handle(body, await dbPromise);
      return new Response(JSON.stringify(out), { headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (err) {
      console.error("clube-beneficio", err);
      return new Response(JSON.stringify({ ok: false, mensagem: "Não foi possível agora. Tente de novo em instantes." }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  });
}
