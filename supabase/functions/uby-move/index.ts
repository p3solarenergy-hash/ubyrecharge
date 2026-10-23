import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

// Recargas da Move pela API: baixa o relatório oficial de recargas (.xlsx, o mesmo
// do painel da Move) e devolve para a tela Importar planilhas, que lê o arquivo com
// o mesmo motor de importação das planilhas baixadas à mão. Chamada com a sessão do
// usuário (functions.invoke). Usuário, senha e Api-Key da Move ficam só nos segredos
// desta função; nada disso vai para o site.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const TIMEOUT_MS = 60000;
const SECRETS = ["MOVE_API_BASE_URL", "MOVE_API_KEY", "MOVE_API_USERNAME", "MOVE_API_PASSWORD"] as const;

type MoveEnv = { base: string; apiKey: string; username: string; password: string; platform: string };

const text = (value: unknown) => value == null ? "" : String(value);
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: CORS });
const env = (name: string) => text(Deno.env.get(name)).trim();

function moveEnv(): { cfg: MoveEnv; missing: string[] } {
  const missing = SECRETS.filter((name) => !env(name));
  return {
    missing,
    cfg: {
      base: env("MOVE_API_BASE_URL").replace(/\/+$/, ""),
      apiKey: env("MOVE_API_KEY"),
      username: env("MOVE_API_USERNAME"),
      password: env("MOVE_API_PASSWORD"),
      platform: env("MOVE_API_PLATFORM") || "DASHBOARD",
    },
  };
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// O token da Move vale por um tempo; enquanto a função estiver de pé, reaproveita.
let cached: { token: string; until: number } | null = null;

async function moveToken(cfg: MoveEnv) {
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(`${cfg.base}/api/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": cfg.apiKey, Platform: cfg.platform },
    body: JSON.stringify({ email: cfg.username, password: cfg.password, recaptchaResponse: "" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  const token = text(data.token).trim();
  if (data.twoFactorRequired) throw new Error("A conta da Move pede verificação em duas etapas. Use um usuário da Move só para a API, sem essa verificação.");
  if (!res.ok || !token) throw new Error(`A Move recusou o login (HTTP ${res.status}${data.error ? `: ${text(data.error)}` : ""}). Confira MOVE_API_USERNAME, MOVE_API_PASSWORD e MOVE_API_KEY nos segredos da função.`);
  // expiresAt pode vir em segundos ou milissegundos; sem ele, 20 minutos. Renova 1 minuto antes.
  const raw = Number(data.expiresAt) || 0;
  const expires = raw > 1e12 ? raw : raw > 1e9 ? raw * 1000 : Date.now() + 20 * 60000;
  cached = { token, until: Math.min(expires, Date.now() + 60 * 60000) - 60000 };
  return token;
}

// A documentação não diz se o token vai puro ou com "Bearer" (o cliente Python manda puro):
// tenta puro e, se a Move recusar, com o prefixo; o jeito que funcionou fica valendo.
let bearer = false;

async function moveFetch(cfg: MoveEnv, url: string, init: RequestInit) {
  const token = await moveToken(cfg);
  const send = (withBearer: boolean) => fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> || {}), "Api-Key": cfg.apiKey, Platform: cfg.platform, Authorization: withBearer ? `Bearer ${token}` : token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let res = await send(bearer);
  if (res.status === 401) {
    await res.body?.cancel();
    const retry = await send(!bearer);
    if (retry.status !== 401) bearer = !bearer;
    res = retry;
  }
  if (res.status === 401) cached = null;
  return res;
}

// Relatório de recargas do mês. A janela vai de um dia antes a um dia depois do mês
// (horário de Brasília) para nada se perder na virada por diferença de fuso; a tela
// fica só com as recargas do mês pedido.
async function report(cfg: MoveEnv, month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const fromKey = addDays(first, -1), toKey = addDays(last, 1);
  // Primeiro em horário local com fuso; se a Move recusar o formato (400), em UTC.
  const formats = [
    (d: string, t: string) => `${d}T${t}-03:00`,
    (d: string, t: string) => new Date(`${d}T${t}-03:00`).toISOString(),
  ];
  let lastError = "";
  for (const format of formats) {
    const params = new URLSearchParams({ fromDate: format(fromKey, "00:00:00"), toDate: format(toKey, "23:59:59"), timeZone: "-3" });
    const res = await moveFetch(cfg, `${cfg.base}/api/v1/report/xlsx/transactions?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (res.ok && bytes[0] === 0x50 && bytes[1] === 0x4b) return { bytes, from: fromKey, to: toKey };
    const snippet = new TextDecoder().decode(bytes.slice(0, 300)).replace(/\s+/g, " ").trim();
    lastError = res.ok
      ? `A Move respondeu sem planilha${snippet ? `: ${snippet}` : "."}`
      : `A Move retornou HTTP ${res.status} no relatório de recargas${snippet ? `: ${snippet}` : "."}`;
    if (res.status !== 400) break;
  }
  throw new Error(lastError);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  try {
    const token = text(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    if (!token) return reply({ ok: false, error: "Entre na plataforma para buscar as recargas da Move." }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth?.user) return reply({ ok: false, error: "Entre na plataforma para buscar as recargas da Move." }, 401);
    // Mesma permissão de quem já vê as recargas: a contagem passa pelas regras (RLS) do próprio usuário.
    const { count, error: accessError } = await supabase.from("obra_recargas_base").select("*", { count: "exact", head: true });
    if (accessError || !count) return reply({ ok: false, error: "Sua conta não tem acesso às recargas." }, 403);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action);
    const { cfg, missing } = moveEnv();

    if (action === "status") {
      let host = "";
      try { host = cfg.base ? new URL(cfg.base).host : ""; } catch (_) { /* endereço inválido: aparece como faltando */ }
      return reply({ ok: true, configured: !missing.length && !!host, missing, host });
    }

    if (action === "report") {
      if (missing.length) return reply({ ok: false, error: `Falta configurar nos segredos da função: ${missing.join(", ")}.` }, 400);
      const month = text(body.month);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return reply({ ok: false, error: "Mês inválido (use AAAA-MM)." }, 400);
      const r = await report(cfg, month);
      return reply({ ok: true, month, from: r.from, to: r.to, filename: `relatorio-recargas-move-api-${month}.xlsx`, bytes: r.bytes.length, file: encodeBase64(r.bytes) });
    }

    return reply({ ok: false, error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error(error);
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    return reply({ ok: false, error: /timed? ?out|aborted/i.test(msg) ? "A Move demorou demais para responder. Tente de novo em alguns minutos." : msg }, 500);
  }
});
