// Daily UBY financial export. Writes human-readable, dated tabs; it never changes source data.
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const n = (v: unknown) => Number(v || 0) || 0;
const s = (v: unknown) => v == null ? "" : String(v);
const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + n(row[key]), 0);
const b64url = (v: Uint8Array | string) => { const bytes = typeof v === "string" ? encoder.encode(v) : v; let out = ""; for (const b of bytes) out += String.fromCharCode(b); return btoa(out).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); };
function pem(p: string) { return Uint8Array.from(atob(p.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")), c => c.charCodeAt(0)); }
async function token(sa: Record<string, string>) {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey("pkcs8", pem(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }) });
  if (!r.ok) throw new Error(`Google token: ${await r.text()}`); return (await r.json()).access_token as string;
}
function tab(name: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach(key => set.add(key)); return set; }, new Set<string>()));
  return { name, values: [headers, ...rows.map(row => headers.map(key => { const value = row[key]; return value == null ? "" : typeof value === "object" ? JSON.stringify(value) : value; }))] };
}
function month(charge: any) { const explicit = s(charge._month); if (/^\d{4}-\d{2}$/.test(explicit)) return explicit; const iso = s(charge.startIso || charge.endIso); return /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : "Sem competência"; }
function executed(charge: any) { const status = [charge.rawStatus, charge.paymentStatus, charge.paymentType, charge.failureReason].map(s).join(" ").toLowerCase(); const energy = n(charge.energyKWh || charge.energy); const revenue = n(charge.revenue || charge.amount); const durationSeconds = n(charge.durationSeconds); return !/(falha|erro|cancel|recus|negad|expir|timeout|interromp|incomplet|nao conclu|sem sucesso|failed|declin|invalid)/.test(status) && energy > .2 && !(durationSeconds > 0 && durationSeconds < 288 && energy < 1) && (energy > 0 || revenue > 0); }
function group<T>(items: T[], key: (item: T) => string, init: (item: T) => any, add: (group: any, item: T) => void) { const map = new Map<string, any>(); for (const item of items) { const id = key(item); const row = map.get(id) || init(item); add(row, item); map.set(id, row); } return [...map.values()]; }

Deno.serve(async () => {
  try {
    const rawAccount = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"), spreadsheetId = Deno.env.get("UBY_EXPORT_SPREADSHEET_ID");
    if (!rawAccount || !spreadsheetId) throw new Error("Configuração de exportação ausente.");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const [works, sessions, reports, matrix, documents] = await Promise.all([
      sb.from("obras").select("id,nome,cliente,local,status_exec,updated_at"),
      // A tabela normalizada é a fonte operacional do painel UBY. Usá-la aqui
      // impede que o e-mail diário some uma cópia antiga por obra.
      sb.from("recharge_sessions").select("session_key,obra_id,source_session_id,station_name,source_station,connector_type,started_at,ended_at,month_key,duration_seconds,idle_seconds,energy_kwh,revenue,idle_value,payment_type,payment_status,raw_status,failure_reason,user_name,user_email,user_phone,vehicle_brand,vehicle_model,voucher,rating,review_comment,source_file,source_file_key,raw_data"),
      sb.from("obra_finance_reports").select("obra_id,station_key,station_name,report_type,period_key,period_start,period_end,status,version,payload,updated_at").is("deleted_at", null),
      sb.from("uby_financial_matrix").select("id,payload,updated_at"),
      sb.from("uby_finance_documents").select("id,scope,work_id,matrix_cost_id,competence_key,supplier,category,document_number,document_type,amount,due_date,status,installment_number,installment_total,file_name,mime_type,file_size,notes,created_at,updated_at"),
    ]);
    for (const r of [works, sessions, reports, matrix, documents]) if (r.error) throw new Error(r.error.message);
    const workNames = new Map((works.data || []).map((work: any) => [work.id, work.nome]));
    const seen = new Set<string>();
    const all = (sessions.data || []).map((session: any) => {
      const raw = session.raw_data && typeof session.raw_data === "object" ? session.raw_data : {};
      return {
        ...raw,
        obra_id: session.obra_id,
        obra: workNames.get(session.obra_id) || session.obra_id,
        id: raw.id || session.source_session_id || session.session_key,
        station: raw.station || session.station_name || "",
        _sourceStation: raw._sourceStation || session.source_station || "",
        connType: raw.connType || session.connector_type || "",
        startIso: raw.startIso || session.started_at || "",
        endIso: raw.endIso || session.ended_at || "",
        startStr: raw.startStr || session.started_at || "",
        endStr: raw.endStr || session.ended_at || "",
        _month: raw._month || s(session.month_key).slice(0, 7),
        durationSeconds: n(session.duration_seconds),
        energyKWh: n(session.energy_kwh),
        revenue: n(session.revenue),
        userName: raw.userName || session.user_name || "",
        userEmail: raw.userEmail || session.user_email || "",
        userPhone: raw.userPhone || session.user_phone || "",
        paymentType: raw.paymentType || session.payment_type || "",
        paymentStatus: raw.paymentStatus || session.payment_status || "",
        rawStatus: raw.rawStatus || session.raw_status || "",
        failureReason: raw.failureReason || session.failure_reason || ""
      };
    }).filter((charge: any) => { const id = [charge.obra_id, charge.id || "", charge.startIso || charge.startStr || ""].join("|"); if (seen.has(id)) return false; seen.add(id); return true; });
    const rows = all.filter(executed);
    const clientKey = (charge: any) => s(charge.userEmail).trim().toLowerCase() || s(charge.userPhone).replace(/\D/g, "") || s(charge.userName).trim().toLowerCase();
    const clientsMap = new Map<string, any>();
    for (const c of rows) { const key = clientKey(c); if (!key) continue; const row = clientsMap.get(key) || { cliente: c.userName || "Não informado", email: c.userEmail || "", telefone: c.userPhone || "", recargas: 0, energia_kwh: 0, faturamento: 0 }; row.recargas++; row.energia_kwh += n(c.energyKWh || c.energy); row.faturamento += n(c.revenue || c.amount); clientsMap.set(key, row); }
    const stations = group(rows, c => `${c.obra_id}|${c.station || c._sourceStation || c.obra}`, c => ({ obra: c.obra, carregador: c.station || c._sourceStation || c.obra, recargas: 0, _clientes: new Set<string>(), energia_kwh: 0, faturamento: 0, inicio: s(c.startIso || c.startStr), fim: s(c.endIso || c.endStr) }), (row, c) => { row.recargas++; row.energia_kwh += n(c.energyKWh || c.energy); row.faturamento += n(c.revenue || c.amount); const key = clientKey(c); if (key) row._clientes.add(key); const start = s(c.startIso || c.startStr), end = s(c.endIso || c.endStr); if (start && (!row.inicio || start < row.inicio)) row.inicio = start; if (end && (!row.fim || end > row.fim)) row.fim = end; }).map(row => ({ obra: row.obra, carregador: row.carregador, recargas: row.recargas, clientes: row._clientes.size, energia_kwh: row.energia_kwh, faturamento: row.faturamento, ticket_medio: row.recargas ? row.faturamento / row.recargas : 0, receita_por_kwh: row.energia_kwh ? row.faturamento / row.energia_kwh : 0, inicio: row.inicio, fim: row.fim }));
    const months = group(rows, month, c => ({ competencia: month(c), recargas: 0, _clientes: new Set<string>(), energia_kwh: 0, faturamento: 0 }), (row, c) => { row.recargas++; row.energia_kwh += n(c.energyKWh || c.energy); row.faturamento += n(c.revenue || c.amount); const key = clientKey(c); if (key) row._clientes.add(key); }).map(row => ({ competencia: row.competencia, recargas: row.recargas, clientes: row._clientes.size, energia_kwh: row.energia_kwh, faturamento: row.faturamento, ticket_medio: row.recargas ? row.faturamento / row.recargas : 0, receita_por_kwh: row.energia_kwh ? row.faturamento / row.energia_kwh : 0 })).sort((a, b) => s(a.competencia).localeCompare(s(b.competencia)));
    const latest = new Map<string, any>();
    for (const report of reports.data || []) { const key = [report.obra_id, report.station_key || report.station_name, report.report_type, report.period_key].join("|"); const old = latest.get(key); if (!old || n(report.version) > n(old.version) || s(report.updated_at) > s(old.updated_at)) latest.set(key, report); }
    const financial = [...latest.values()].map((report: any) => { const payload = report.payload || {}, metrics = payload.metrics || {}, result = payload.result || {}; return { competencia: report.period_key, obra: workNames.get(report.obra_id) || report.obra_id, carregador: report.station_name || payload.work?.stationName || "Não informado", tipo_relatorio: report.report_type, status: report.status, recargas: n(metrics.charges ?? result.charges), clientes: n(metrics.clients ?? result.clients), energia_kwh: n(metrics.energy ?? result.energy), faturamento: n(result.totalRevenue ?? metrics.revenue ?? result.revenue), custos_totais: n(result.totalOperatingCost), impostos: n(result.taxes), gestao_operacao: n(result.management) + n(result.platform) + n(result.areaParticipation), royalties_uby: n(result.ubyRoyalty), resultado: n(result.operationNet), reserva_legal_sa: n(result.saRetention), distribuicao_investidores: n(result.investorDistribution ?? result.finalDistribution), atualizado_em: report.updated_at }; }).sort((a, b) => s(a.competencia).localeCompare(s(b.competencia)) || s(a.carregador).localeCompare(s(b.carregador)));
    const now = new Date(), competence = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(now), revenue = rows.reduce((total: number, c: any) => total + n(c.revenue || c.amount), 0), energy = rows.reduce((total: number, c: any) => total + n(c.energyKWh || c.energy), 0);
    const sheets = [
      tab("Painel operacional", [{ indicador: "Competência do snapshot", valor: competence, observacao: "Base importada até o momento da geração" }, { indicador: "Faturamento de recargas", valor: revenue, observacao: "Sessões executadas; não inclui marketing, royalties ou receitas extras" }, { indicador: "Recargas válidas", valor: rows.length, observacao: "Exclui falhas e cancelamentos" }, { indicador: "Clientes únicos", valor: clientsMap.size, observacao: "Por e-mail, telefone ou nome" }, { indicador: "Energia entregue (kWh)", valor: energy, observacao: "Sessões executadas" }, { indicador: "Ticket médio por recarga", valor: rows.length ? revenue / rows.length : 0, observacao: "Faturamento / recargas válidas" }, { indicador: "Receita média por kWh", valor: energy ? revenue / energy : 0, observacao: "Faturamento / energia entregue" }, { indicador: "Fechamentos financeiros disponíveis", valor: financial.length, observacao: "Última versão por carregador, competência e tipo" }]),
      tab("Desempenho por carregador", stations.sort((a, b) => n(b.faturamento) - n(a.faturamento))), tab("Desempenho mensal", months), tab("Fechamentos financeiros", financial), tab("Clientes", [...clientsMap.values()].sort((a, b) => n(b.faturamento) - n(a.faturamento))),
      tab("Recargas detalhadas", rows.map((c: any) => ({ competencia: month(c), inicio: c.startIso || c.startStr || "", fim: c.endIso || c.endStr || "", obra: c.obra, carregador: c.station || c._sourceStation || "", cliente: c.userName || "", email: c.userEmail || "", telefone: c.userPhone || "", energia_kwh: n(c.energyKWh || c.energy), faturamento: n(c.revenue || c.amount), duracao: c.duration || "", pagamento: c.paymentType || "", status_pagamento: c.paymentStatus || "", id_recarga: c.id || "" }))),
      tab("Relatorios tecnicos", (reports.data || []).map((r: any) => ({ obra_id: r.obra_id, carregador: r.station_name, tipo: r.report_type, competencia: r.period_key, status: r.status, versao: r.version, atualizado_em: r.updated_at }))), tab("Matriz centralizada", (matrix.data || []).map((r: any) => ({ id: r.id, atualizado_em: r.updated_at, observacao: "Configuração centralizada preservada no Supabase; consultar o painel para detalhamento" }))), tab("Documentos financeiros", documents.data || []), tab("Obras", works.data || []),
    ];
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(now); const part = (type: string) => parts.find(x => x.type === type)?.value || "00"; const snapshot = `${part("year")}-${part("month")}-${part("day")} ${part("hour")}${part("minute")}${part("second")}`;
    const dated = sheets.map(sheet => ({ ...sheet, name: `${sheet.name.slice(0, 80)} ${snapshot}` })); const access = await token(JSON.parse(rawAccount)); const headers = { authorization: `Bearer ${access}`, "content-type": "application/json" };
    const create = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests: dated.map(sheet => ({ addSheet: { properties: { title: sheet.name } } })) }) }); if (!create.ok) throw new Error(`Google Sheets abas: ${await create.text()}`);
    const write = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ valueInputOption: "RAW", data: dated.map(sheet => ({ range: `'${sheet.name}'!A1`, values: sheet.values })) }) }); if (!write.ok) throw new Error(`Google Sheets dados: ${await write.text()}`);
    return Response.json({ ok: true, competence, snapshot, recargas: rows.length, clientes: clientsMap.size, faturamento: revenue, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
  } catch (error) { console.error(error); return Response.json({ ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 }); }
});
