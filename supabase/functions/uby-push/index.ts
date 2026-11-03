import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Notificações no celular (Web Push). Chamada pela plataforma com a sessão do
// usuário (functions.invoke): guarda/remove o aparelho e envia o teste.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const DEFAULT_SUBJECT = "https://ubyrecharge.net.br/nova/";
const TABLE = "uby_push_subscriptions";
const VAPID_TABLE = "uby_push_vapid";

type Subscription = { endpoint: string; p256dh: string; auth: string };
type Vapid = { subject: string; publicKey: string; privateKey: string };

const text = (value: unknown) => value == null ? "" : String(value);
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: CORS });

// Chaves dos segredos da função, se existirem; senão, as do banco. Na primeira
// chamada o par é gerado e gravado (se duas chamadas gerarem juntas, vale o que
// gravou primeiro), então a chave privada nunca sai do Supabase.
async function vapid(supabase: SupabaseClient): Promise<Vapid> {
  const subject = text(Deno.env.get("VAPID_SUBJECT")).trim() || DEFAULT_SUBJECT;
  const envPublic = text(Deno.env.get("VAPID_PUBLIC_KEY")).trim();
  const envPrivate = text(Deno.env.get("VAPID_PRIVATE_KEY")).trim();
  if (envPublic && envPrivate) return { subject, publicKey: envPublic, privateKey: envPrivate };

  const load = async () => {
    const { data, error } = await supabase.from(VAPID_TABLE).select("public_key,private_key").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data ? { subject, publicKey: text(data.public_key), privateKey: text(data.private_key) } : null;
  };
  const saved = await load();
  if (saved) return saved;
  const keys = webpush.generateVAPIDKeys();
  const { error } = await supabase.from(VAPID_TABLE).upsert({ id: 1, public_key: keys.publicKey, private_key: keys.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  const created = await load();
  if (!created) throw new Error("Não foi possível gravar as chaves das notificações.");
  return created;
}

// O web-push só monta o pedido criptografado; o envio vai pelo fetch do Deno
// (o envio próprio da biblioteca usa o https do Node).
async function send(sub: Subscription, payload: Record<string, unknown>, keys: Vapid) {
  const req = webpush.generateRequestDetails(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { vapidDetails: keys, TTL: 24 * 3600, urgency: "high" },
  );
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (name.toLowerCase() !== "content-length") headers.set(name, text(value));
  const res = await fetch(req.endpoint, { method: req.method, headers, body: req.body });
  await res.body?.cancel();
  return res.status;
}

function readSubscription(body: Record<string, unknown>): Subscription | null {
  const sub = (body.subscription || {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = text(sub.endpoint).trim();
  const p256dh = text(sub.keys?.p256dh).trim();
  const auth = text(sub.keys?.auth).trim();
  // p256dh = chave pública P-256 (65 bytes) e auth = 16 bytes, ambos em base64url.
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !/^[\w-]{86,88}=*$/.test(p256dh) || !/^[\w-]{22,24}=*$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = text(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    const user = auth?.user;
    if (!user) return reply({ ok: false, error: "Entre na plataforma para usar as notificações." }, 401);

    const keys = await vapid(supabase);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action);

    if (action === "config") return reply({ ok: true, publicKey: keys.publicKey });

    if (action === "subscribe") {
      const sub = readSubscription(body);
      if (!sub) return reply({ ok: false, error: "Inscrição do aparelho inválida." }, 400);
      const { error } = await supabase.from(TABLE).upsert({
        user_id: user.id,
        ...sub,
        device_label: text(body.label).slice(0, 60) || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return reply({ ok: true });
    }

    if (action === "unsubscribe") {
      const { error } = await supabase.from(TABLE).delete().eq("user_id", user.id).eq("endpoint", text(body.endpoint));
      if (error) throw error;
      return reply({ ok: true });
    }

    if (action === "test") {
      const { data: subs, error } = await supabase.from(TABLE).select("id,endpoint,p256dh,auth").eq("user_id", user.id);
      if (error) throw error;
      if (!subs?.length) return reply({ ok: false, error: "Nenhum aparelho com notificações ativas nesta conta." }, 404);
      const payload = { title: "UBY Recharge", body: "Teste: as notificações estão funcionando neste aparelho.", url: "./index.html#/avisos", tag: "uby-teste" };
      let sent = 0, removed = 0, failed = 0;
      for (const sub of subs) {
        const status = await send(sub as Subscription, payload, keys).catch(() => 0);
        if (status >= 200 && status < 300) {
          sent++;
          await supabase.from(TABLE).update({ last_sent_at: new Date().toISOString() }).eq("id", sub.id);
        } else if (status === 404 || status === 410) {
          // O aparelho desinstalou o app ou revogou a permissão: a inscrição não volta mais.
          removed++;
          await supabase.from(TABLE).delete().eq("id", sub.id);
        } else failed++;
      }
      return reply({ ok: sent > 0, sent, removed, failed, ...(sent ? {} : { error: "Nenhum aparelho recebeu o teste." }) });
    }

    return reply({ ok: false, error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error(error);
    return reply({ ok: false, error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
