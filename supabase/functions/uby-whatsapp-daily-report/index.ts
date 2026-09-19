import { createClient } from "npm:@supabase/supabase-js@2";

const SAO_PAULO = "America/Sao_Paulo";
const UBY_WORK_IDS = new Set(["malassise", "posto-central-jk", "ac-posto-central-jk"]);
const SESSION_COLUMNS = "session_key,obra_id,source_session_id,started_at,duration_seconds,energy_kwh,revenue,payment_type,payment_status,raw_status,failure_reason,user_name,user_email,user_phone";
const BODY_PARAMETER_NAMES = ["competencia", "faturamento", "energia_kwh", "recargas", "clientes", "clientes_novos", "variacao_percentual"];

type Session = Record<string, unknown>;
type DailyMetrics = {
  competence: string;
  revenue: number;
  energy: number;
  charges: number;
  clients: number;
  newClients: number;
  variationPct: number;
};

const number = (value: unknown) => Number(value || 0) || 0;
const text = (value: unknown) => value == null ? "" : String(value);

function localDateKey(value: unknown) {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isExecutedSession(session: Session) {
  const status = [session.raw_status, session.payment_status, session.payment_type, session.failure_reason]
    .map(text)
    .join(" ")
    .toLowerCase();
  const energy = number(session.energy_kwh);
  const revenue = number(session.revenue);
  const durationSeconds = number(session.duration_seconds);

  // Espelha a regra operacional do Painel UBY. Não simplifique este filtro
  // sem conferir o reflexo no dashboard e no relatório financeiro.
  if (/(falha|erro|cancel|recus|negad|expir|timeout|interromp|incomplet|nao conclu|sem sucesso|failed|declin|invalid|invalido)/.test(status)) return false;
  if (energy <= 0.25 && revenue <= 1) return false;
  if (durationSeconds > 0 && durationSeconds < 288 && energy < 1) return false;
  if (durationSeconds <= 0 && revenue <= 0) return false;
  return true;
}

function clientKey(session: Session) {
  const email = text(session.user_email).trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = text(session.user_phone).replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  const name = text(session.user_name).trim().toLowerCase();
  return name ? `name:${name}` : "";
}

function sessionKey(session: Session) {
  return text(session.session_key).trim() || [session.obra_id, session.source_session_id, session.started_at].map(text).join("|");
}

function formatDatePtBr(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatKwh(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} kWh`;
}

function formatPercent(value: number) {
  const rendered = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return `${value > 0 ? "+" : ""}${rendered}%`;
}

function normalizeRecipient(value: string) {
  const normalized = value.replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(normalized)) throw new Error("Destinatário WhatsApp inválido na configuração.");
  return normalized;
}

function maskRecipient(value: string) {
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getConfiguration() {
  const rawRecipients = text(Deno.env.get("WHATSAPP_DAILY_RECIPIENTS"))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const recipients: string[] = [];
  let hasInvalidRecipient = false;
  for (const value of rawRecipients) {
    try {
      recipients.push(normalizeRecipient(value));
    } catch {
      hasInvalidRecipient = true;
    }
  }
  const config = {
    enabled: text(Deno.env.get("WHATSAPP_ENABLED")).toLowerCase() === "true",
    accessToken: text(Deno.env.get("WHATSAPP_ACCESS_TOKEN")).trim(),
    phoneNumberId: text(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")).trim(),
    graphVersion: text(Deno.env.get("WHATSAPP_GRAPH_API_VERSION")).trim(),
    templateName: text(Deno.env.get("WHATSAPP_TEMPLATE_NAME")).trim(),
    templateLanguage: text(Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE")).trim() || "pt_BR",
    parameterFormat: text(Deno.env.get("WHATSAPP_TEMPLATE_PARAMETER_FORMAT")).trim().toUpperCase() || "NAMED",
    recipients,
  };
  const missing = [
    !config.accessToken && "WHATSAPP_ACCESS_TOKEN",
    !config.phoneNumberId && "WHATSAPP_PHONE_NUMBER_ID",
    !config.graphVersion && "WHATSAPP_GRAPH_API_VERSION",
    !config.templateName && "WHATSAPP_TEMPLATE_NAME",
    (!recipients.length || hasInvalidRecipient) && "WHATSAPP_DAILY_RECIPIENTS",
  ].filter(Boolean) as string[];
  if (!["NAMED", "POSITIONAL"].includes(config.parameterFormat)) missing.push("WHATSAPP_TEMPLATE_PARAMETER_FORMAT=NAMED|POSITIONAL");
  return { config, missing };
}

async function loadSessions(supabase: ReturnType<typeof createClient>) {
  const sessions: Session[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("recharge_sessions")
      .select(SESSION_COLUMNS)
      .in("obra_id", [...UBY_WORK_IDS])
      .order("started_at", { ascending: true, nullsFirst: false })
      .range(offset, offset + 999);
    if (error) throw new Error(`Leitura de recargas: ${error.message}`);
    sessions.push(...((data || []) as Session[]));
    if (!data || data.length < 1000) break;
  }
  const seen = new Set<string>();
  return sessions.filter((session) => {
    if (!UBY_WORK_IDS.has(text(session.obra_id))) return false;
    const key = sessionKey(session);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return isExecutedSession(session) && Boolean(localDateKey(session.started_at));
  });
}

function calculateDailyMetrics(sessions: Session[], competence: string): DailyMetrics {
  const byDate = new Map<string, { revenue: number; energy: number; charges: number; clients: Set<string>; newClients: Set<string> }>();
  const firstDateByClient = new Map<string, string>();

  for (const session of sessions) {
    const date = localDateKey(session.started_at);
    const client = clientKey(session);
    if (client && (!firstDateByClient.has(client) || date < firstDateByClient.get(client)!)) firstDateByClient.set(client, date);
    if (!byDate.has(date)) byDate.set(date, { revenue: 0, energy: 0, charges: 0, clients: new Set(), newClients: new Set() });
  }

  for (const session of sessions) {
    const date = localDateKey(session.started_at);
    const row = byDate.get(date)!;
    const client = clientKey(session);
    row.revenue += number(session.revenue);
    row.energy += number(session.energy_kwh);
    row.charges += 1;
    if (client) {
      row.clients.add(client);
      if (firstDateByClient.get(client) === date) row.newClients.add(client);
    }
  }

  const today = byDate.get(competence) || { revenue: 0, energy: 0, charges: 0, clients: new Set<string>(), newClients: new Set<string>() };
  const previous = byDate.get(addDays(competence, -1));
  const previousRevenue = previous?.revenue || 0;
  return {
    competence,
    revenue: today.revenue,
    energy: today.energy,
    charges: today.charges,
    clients: today.clients.size,
    newClients: today.newClients.size,
    variationPct: previousRevenue > 0 ? ((today.revenue - previousRevenue) / previousRevenue) * 100 : (today.revenue > 0 ? 100 : 0),
  };
}

function templateParameters(metrics: DailyMetrics, parameterFormat: string) {
  const values = [
    formatDatePtBr(metrics.competence),
    formatCurrency(metrics.revenue),
    formatKwh(metrics.energy),
    String(metrics.charges),
    String(metrics.clients),
    String(metrics.newClients),
    formatPercent(metrics.variationPct),
  ];
  return values.map((value, index) => parameterFormat === "NAMED"
    ? { type: "text", parameter_name: BODY_PARAMETER_NAMES[index], text: value }
    : { type: "text", text: value });
}

function readiness(metrics: DailyMetrics, missing: string[], config: ReturnType<typeof getConfiguration>["config"]) {
  return {
    mode: "preview",
    metrics,
    configured: missing.length === 0,
    sendingEnabled: config.enabled,
    missing,
    template: config.templateName || null,
    language: config.templateLanguage,
    parameterFormat: config.parameterFormat,
    recipients: config.recipients.map(maskRecipient),
    parameterNames: BODY_PARAMETER_NAMES,
  };
}

function hasValidJobSecret(request: Request) {
  const expected = text(Deno.env.get("UBY_WHATSAPP_JOB_SECRET")).trim();
  return Boolean(expected) && request.headers.get("x-uby-whatsapp-job-secret") === expected;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ ok: false, error: "Use POST." }, { status: 405 });
  if (!hasValidJobSecret(request)) return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "send" ? "send" : "preview";
    const today = localDateKey(new Date().toISOString());
    const competence = /^\d{4}-\d{2}-\d{2}$/.test(text(body?.competence)) ? text(body.competence) : addDays(today, -1);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const sessions = await loadSessions(supabase);
    const metrics = calculateDailyMetrics(sessions, competence);
    const { config, missing } = getConfiguration();

    if (mode === "preview") return Response.json({ ok: true, ...readiness(metrics, missing, config) });
    if (!config.enabled) return Response.json({ ok: false, error: "Envio WhatsApp está desativado (WHATSAPP_ENABLED).", ...readiness(metrics, missing, config) }, { status: 409 });
    if (missing.length) return Response.json({ ok: false, error: "Configuração WhatsApp incompleta.", ...readiness(metrics, missing, config) }, { status: 409 });

    const results = [];
    for (const recipient of config.recipients) {
      const recipientHash = await sha256(recipient);
      const { data: existing, error: findError } = await supabase
        .from("uby_whatsapp_delivery_log")
        .select("status,graph_message_id,created_at")
        .eq("competence_key", competence)
        .eq("template_name", config.templateName)
        .eq("recipient_hash", recipientHash)
        .maybeSingle();
      if (findError) throw new Error("Auditoria WhatsApp indisponível. Aplique supabase/uby_whatsapp_daily_report.sql antes do envio.");
      if (existing) {
        results.push({ recipient: maskRecipient(recipient), status: "blocked_duplicate", previousStatus: existing.status, messageId: existing.graph_message_id || null });
        continue;
      }

      const { error: claimError } = await supabase.from("uby_whatsapp_delivery_log").insert({
        competence_key: competence,
        template_name: config.templateName,
        recipient_hash: recipientHash,
        status: "queued",
      });
      if (claimError) throw new Error("Não foi possível reservar o envio na auditoria. Nenhuma mensagem foi enviada.");

      const graphResponse = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "template",
          template: {
            name: config.templateName,
            language: { code: config.templateLanguage },
            components: [{ type: "body", parameters: templateParameters(metrics, config.parameterFormat) }],
          },
        }),
      });
      const graphBody = await graphResponse.json().catch(() => ({}));
      const messageId = text(graphBody?.messages?.[0]?.id).trim() || null;
      const graphError = graphBody?.error || {};
      const status = graphResponse.ok && messageId ? "sent" : "uncertain";
      const { error: updateError } = await supabase.from("uby_whatsapp_delivery_log").update({
        status,
        graph_message_id: messageId,
        graph_error_code: graphError?.code ? String(graphError.code) : null,
        graph_error_message: graphError?.message ? String(graphError.message).slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      }).eq("competence_key", competence).eq("template_name", config.templateName).eq("recipient_hash", recipientHash);
      if (updateError) throw new Error("A Meta pode ter aceitado a mensagem, mas a auditoria não foi atualizada. O envio ficou bloqueado para evitar duplicidade.");
      results.push({ recipient: maskRecipient(recipient), status, messageId, graphErrorCode: graphError?.code || null });
    }

    return Response.json({ ok: results.every((result) => result.status === "sent"), mode, metrics, results });
  } catch (error) {
    console.error("UBY WhatsApp daily report failed", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Erro inesperado." }, { status: 500 });
  }
});
