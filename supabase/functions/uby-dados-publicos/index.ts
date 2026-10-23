// Dados públicos que o site não consegue buscar direto (a API não libera chamada do
// navegador). Só consulta endereços fixos; nada do usuário vai para fora.
// Ação "bandeira": bandeira tarifária da ANEEL dos últimos meses (dados abertos), usada em Avisos.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ANEEL_FLAGS = "https://dadosabertos.aneel.gov.br/api/3/action/datastore_search?resource_id=0591b8f6-fe54-437b-b72b-1aa2efd46e42&sort=DatCompetencia%20desc&limit=13";
const CACHE_MS = 6 * 3600000;

type Flag = { month: string; flag: string; rsPerMWh: number };

const text = (value: unknown) => value == null ? "" : String(value);
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: CORS });

let cached: { at: number; months: Flag[] } | null = null;

// { DatCompetencia: "2026-10-01", NomBandeiraAcionada: "Verde", VlrAdicionalBandeira: ",00" | "18,85" }
// O adicional vem em R$/MWh, com vírgula decimal.
function readFlags(records: Record<string, unknown>[]): Flag[] {
  return records.map((r) => ({
    month: text(r.DatCompetencia).slice(0, 7),
    flag: text(r.NomBandeiraAcionada).trim(),
    rsPerMWh: Number(text(r.VlrAdicionalBandeira).replace(/\./g, "").replace(",", ".")) || 0,
  })).filter((f) => /^\d{4}-\d{2}$/.test(f.month) && f.flag);
}

async function flags() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.months;
  const res = await fetch(ANEEL_FLAGS, { signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({})) as { success?: boolean; result?: { records?: Record<string, unknown>[] } };
  if (!res.ok || !data.success) throw new Error(`A ANEEL não respondeu (HTTP ${res.status}).`);
  const months = readFlags(data.result?.records || []);
  if (!months.length) throw new Error("A ANEEL respondeu sem bandeiras.");
  cached = { at: Date.now(), months };
  return months;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (text(body.action) === "bandeira") return reply({ ok: true, source: "ANEEL · dados abertos (Bandeiras Tarifárias - Acionamento)", months: await flags() });
    return reply({ ok: false, error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error(error);
    return reply({ ok: false, error: error instanceof Error ? error.message : "Erro inesperado." }, 502);
  }
});
