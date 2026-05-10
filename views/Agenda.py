"""
Agenda P3 Energy
================
Topo replicado do artifact (hero + 4 KPIs + weather strip),
com tempo ao vivo via Open-Meteo.  Abaixo: Google Calendar embed
+ análise de mercado EV & Solar.
"""

import streamlit as st
import streamlit.components.v1 as components

from utils.p3_styles import inject, section_title

inject()

# ── TOPO: réplica exata do artifact ──────────────────────────────────────────
components.html("""
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                 "Helvetica Neue", Arial, sans-serif;
    background: transparent;
    color: #e6ebf5;
    line-height: 1.5;
    font-size: 14px;
  }

  /* ── header ── */
  header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px; margin-bottom: 16px;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, #f5b400 0%, #3b82f6 100%);
    display: flex; align-items: center; justify-content: center;
    color: #0b0f17; font-weight: 800; font-size: 18px;
    box-shadow: 0 6px 18px rgba(59,130,246,.35); flex-shrink: 0;
  }
  h1 { font-size: 22px; color: #f5f7fb; font-weight: 700; }
  .subtitle { font-size: 13px; color: #8a93a8; margin-top: 2px; }
  .updated { font-size: 12px; color: #8a93a8; }

  /* ── hero ── */
  .hero {
    background: linear-gradient(135deg, #182239 0%, #1a1530 100%);
    border: 1px solid #2a3a5e;
    border-radius: 16px;
    padding: 18px 20px;
    margin-bottom: 12px;
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 18px;
  }
  @media (max-width: 700px) { .hero { grid-template-columns: 1fr; } }

  .hero-next .label {
    font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
    color: #93c5fd; font-weight: 700; margin-bottom: 6px;
  }
  .hero-next .title {
    font-size: 22px; font-weight: 700; color: #f5f7fb; margin-bottom: 8px;
  }
  .hero-next .meta { color: #b9c2d6; font-size: 13px; }

  .hero-summary .label {
    font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
    color: #fbbf24; font-weight: 700; margin-bottom: 8px;
  }
  .summary-line {
    font-size: 13.5px; color: #d4dbeb; margin-bottom: 6px; line-height: 1.5;
  }
  .summary-line strong { color: #f5f7fb; }

  /* ── KPI strip ── */
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 12px;
  }
  @media (max-width: 600px) { .kpis { grid-template-columns: 1fr 1fr; } }

  .kpi {
    background: #121a2a;
    border: 1px solid #1f2a40;
    border-radius: 12px;
    padding: 12px 14px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .kpi-label { font-size: 11px; color: #8a93a8; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
  .kpi-value { font-size: 22px; font-weight: 800; color: #f5f7fb; }
  .kpi-sub   { font-size: 11px; color: #8a93a8; }

  .kpi.gmail   .kpi-value { color: #60a5fa; }
  .kpi.events  .kpi-value { color: #4ade80; }
  .kpi.next    .kpi-value { color: #f472b6; font-size: 15px; line-height: 1.3; }
  .kpi.weather .kpi-value { color: #fbbf24; }

  /* ── weather strip ── */
  .weather-card {
    background: #121a2a;
    border: 1px solid #1f2a40;
    border-radius: 14px;
    padding: 14px 18px;
  }
  .weather-card h3 {
    font-size: 14px; font-weight: 700; color: #f5f7fb;
    display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
  }
  .weather-strip {
    display: flex; gap: 20px; align-items: center; flex-wrap: wrap;
    background: linear-gradient(135deg, rgba(245,180,0,.10) 0%, rgba(59,130,246,.10) 100%);
    border: 1px solid #1f2a40; border-radius: 10px;
    padding: 10px 14px;
  }
  .w-item { display: flex; gap: 6px; align-items: baseline; }
  .w-num   { font-weight: 800; font-size: 16px; color: #f5f7fb; }
  .w-label { font-size: 11px; color: #8a93a8; }
  .weather-note { font-size: 12px; color: #8a93a8; margin-top: 8px; }
</style>
</head>
<body>

<!-- Header -->
<header>
  <div class="brand">
    <div class="logo">P3</div>
    <div>
      <h1>Painel P3 Energy</h1>
      <div class="subtitle">Agenda · Mercado EV &amp; Solar · Londrina/PR</div>
    </div>
  </div>
  <div>
    <span class="updated" id="updated">—</span>
  </div>
</header>

<!-- Hero -->
<section class="hero">
  <div class="hero-next">
    <div class="label">Próximo compromisso</div>
    <div class="title">Sem compromissos à frente</div>
    <div class="meta">Aproveite o tempo livre.</div>
  </div>
  <div class="hero-summary">
    <div class="label">Resumo executivo do dia</div>
    <div>
      <div class="summary-line">📅 <strong>Sem compromissos hoje.</strong> Boa janela para prospecção e follow-up.</div>
      <div class="summary-line">⚡ <strong>EV em alta:</strong> +88% no 1T26, BYD Dolphin Mini lidera com 50%+ das vendas.</div>
      <div class="summary-line">☀️ <strong>Atenção solar:</strong> custos +30% e Fio B em 60% — revisar precificação de propostas em aberto.</div>
      <div class="summary-line" id="weather-summary-line"></div>
    </div>
  </div>
</section>

<!-- KPIs -->
<div class="kpis">
  <div class="kpi gmail">
    <div class="kpi-label">📬 Inbox não lido</div>
    <div class="kpi-value">0</div>
    <div class="kpi-sub">inbox zerado 🎉</div>
  </div>
  <div class="kpi events">
    <div class="kpi-label">📅 Eventos hoje</div>
    <div class="kpi-value">0</div>
    <div class="kpi-sub">na agenda</div>
  </div>
  <div class="kpi next">
    <div class="kpi-label">⏰ Próximo evento</div>
    <div class="kpi-value">—</div>
    <div class="kpi-sub">sem próximos eventos</div>
  </div>
  <div class="kpi weather">
    <div class="kpi-label">🌤 Londrina</div>
    <div class="kpi-value" id="kpi-temp">…</div>
    <div class="kpi-sub" id="kpi-cond">carregando</div>
  </div>
</div>

<!-- Tempo & Irradiância -->
<div class="weather-card">
  <h3>🌤 Tempo &amp; irradiância — Londrina/Cambé</h3>
  <div class="weather-strip" id="weather-strip">
    <div class="w-item"><span class="w-num" id="w-temp">…</span><span class="w-label">°C máx</span></div>
    <div class="w-item"><span class="w-num" id="w-hum">…</span><span class="w-label">% umidade</span></div>
    <div class="w-item"><span class="w-num" id="w-cond">…</span></div>
    <div class="w-item" id="w-prec-wrap" style="display:none">
      <span class="w-num" id="w-prec">…</span><span class="w-label">mm hoje</span>
    </div>
    <div class="w-item"><span class="w-num" id="w-rad">…</span></div>
  </div>
  <div class="weather-note" id="weather-note">Fonte: Open-Meteo · SIMEPAR — ao vivo</div>
</div>

<script>
const WMO = {
  0:"Céu limpo",1:"Predo. limpo",2:"Parcialmente nublado",3:"Nublado",
  45:"Névoa",48:"Névoa c/ geada",51:"Garoa leve",53:"Garoa moderada",55:"Garoa intensa",
  61:"Chuva leve",63:"Chuva moderada",65:"Chuva forte",
  71:"Neve leve",73:"Neve moderada",75:"Neve forte",
  80:"Pancadas leves",81:"Pancadas moderadas",82:"Pancadas fortes",
  95:"Tempestade",96:"Tempestade c/ granizo",99:"Tempestade forte"
};

async function fetchWeather() {
  try {
    const url = [
      "https://api.open-meteo.com/v1/forecast",
      "?latitude=-23.31&longitude=-51.16",
      "&current=temperature_2m,relative_humidity_2m,weather_code,precipitation,apparent_temperature",
      "&daily=temperature_2m_max,precipitation_sum,shortwave_radiation_sum",
      "&timezone=America%2FSao_Paulo&forecast_days=1"
    ].join("");
    const data = await fetch(url).then(r => r.json());
    const cur = data.current;
    const daily = data.daily || {};

    const temp  = Math.round(cur.temperature_2m);
    const hum   = cur.relative_humidity_2m;
    const code  = cur.weather_code;
    const cond  = WMO[code] || "—";
    const prec  = (daily.precipitation_sum || [0])[0] || 0;
    const maxT  = Math.round((daily.temperature_2m_max || [temp])[0]);
    const rad   = (daily.shortwave_radiation_sum || [])[0];
    const radTxt = rad != null
      ? (rad < 10 ? "irradiância reduzida" : rad < 18 ? "irradiância moderada" : "boa irradiância")
      : "";
    const isRainy = [51,53,55,61,63,65,80,81,82,95,96,99].includes(code);

    // KPI
    document.getElementById("kpi-temp").textContent = temp + "°C";
    document.getElementById("kpi-cond").textContent = cond.toLowerCase();

    // Strip
    document.getElementById("w-temp").textContent = maxT + "°C";
    document.getElementById("w-hum").textContent  = hum + "%";
    document.getElementById("w-cond").textContent  = cond;
    if (prec > 0) {
      document.getElementById("w-prec").textContent = prec.toFixed(1) + " mm";
      document.getElementById("w-prec-wrap").style.display = "flex";
    }
    if (radTxt) document.getElementById("w-rad").textContent = "⬇ " + radTxt;

    // Summary line
    const emoji = isRainy ? "🌧" : code <= 1 ? "☀️" : "🌤";
    const genNote = isRainy ? " — geração reduzida hoje" : rad != null && rad < 10 ? " — geração abaixo da média" : "";
    document.getElementById("weather-summary-line").innerHTML =
      `<div class="summary-line">${emoji} <strong>Tempo:</strong> ${cond.toLowerCase()} em Londrina${genNote}.</div>`;

  } catch(e) {
    ["kpi-temp","w-temp","w-hum","w-cond","w-rad"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
    document.getElementById("kpi-cond").textContent = "indisponível";
  }
}

function tick() {
  const now = new Date().toLocaleTimeString("pt-BR",{
    hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"America/Sao_Paulo"
  });
  const el = document.getElementById("updated");
  if (el) el.textContent = "Atualizado " + now;
}

fetchWeather();
tick();
setInterval(tick, 1000);
</script>
</body>
</html>
""", height=500, scrolling=False)

# ── CALENDÁRIO GOOGLE ─────────────────────────────────────────────────────────

section_title("📅 Minha agenda")

CALENDAR_EMAIL = "p3solarenergy@gmail.com"
CALENDAR_URL = (
    f"https://calendar.google.com/calendar/embed"
    f"?src={CALENDAR_EMAIL.replace('@', '%40')}"
    f"&ctz=America%2FSao_Paulo"
    f"&bgcolor=%23000000"
    f"&color=%233FB66B"
    f"&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0"
    f"&mode=WEEK"
)

import streamlit.components.v1 as _comp  # noqa — já importado acima
components.html(
    f"""
    <div style="border-radius:12px;overflow:hidden;border:1px solid #2A3530;">
      <iframe
        src="{CALENDAR_URL}"
        style="width:100%;height:560px;border:0;display:block;background:#16221E;"
        frameborder="0" scrolling="no">
      </iframe>
    </div>
    <p style="font-size:11px;color:#6A7F78;margin-top:6px;">
      ⚠️ Para exibir o calendário, acesse
      <a href="https://calendar.google.com/calendar/r/settings/calendar/{CALENDAR_EMAIL.replace('@','%40')}"
         target="_blank" style="color:#3FB66B;">Configurações do Google Calendar</a>
      → Configurações e compartilhamento → marque
      <strong>"Disponibilizar ao público"</strong>.
    </p>
    """,
    height=595,
)

st.markdown("---")

# ── ANÁLISE DE MERCADO ────────────────────────────────────────────────────────

section_title("📊 Análise de Mercado — mai/2026")

ev_col, sol_col = st.columns(2, gap="large")

with ev_col:
    st.markdown(
        "<p style='font-size:13px;font-weight:700;color:#3FB66B;margin-bottom:12px;'>"
        "⚡ Veículos Elétricos</p>",
        unsafe_allow_html=True,
    )
    ev1, ev2 = st.columns(2)
    ev1.metric("Crescimento 1T26 vs 1T25", "+88%", "+88%")
    ev2.metric("Emplacamentos 1T26", "95 mil unidades")
    ev3, ev4 = st.columns(2)
    ev3.metric("Projeção 2026", "280–300 mil")
    ev4.metric("Participação mercado", "~15%")
    with st.container(border=True):
        st.markdown("""
**BYD Dolphin Mini** lidera com folga — mais de **50% das vendas** de elétricos no 1T26.
Preço agressivo e bom pacote de equipamentos consolidam o modelo como referência.

**MG Motor** anuncia novo elétrico para enfrentar BYD e Geely no Brasil em 2026.

**Seminovos elétricos** saem do estoque em menos de **40 dias** — BEVs em menos de 20 dias.
        """)
        st.caption("Fontes: ABVE · Reconecta News · Vrum · CNN Brasil — mai/2026")
        c1, c2, c3 = st.columns(3)
        c1.link_button("🔗 Reconecta", "https://reconectanews.com.br/veiculos-eletrificados-no-brasil-podem-chegar-a-300-mil-vendas-em-2026/", use_container_width=True)
        c2.link_button("🔗 Vrum", "https://www.vrum.com.br/mercado/2026/04/7402036-os-5-carros-eletricos-mais-vendidos-do-brasil-no-1-trimestre-de-2026.html", use_container_width=True)
        c3.link_button("🔗 CNN Brasil", "https://www.cnnbrasil.com.br/auto/carros-eletricos-devem-ocupar-15-do-mercado-em-2026/", use_container_width=True)

with sol_col:
    st.markdown(
        "<p style='font-size:13px;font-weight:700;color:#F5A623;margin-bottom:12px;'>"
        "☀️ Energia Solar Fotovoltaica</p>",
        unsafe_allow_html=True,
    )
    s1, s2 = st.columns(2)
    s1.metric("Adições em 2026", "10,6 GW", "-7% vs 2025", delta_color="inverse")
    s2.metric("Fio B 2026", "60%", "+45pp desde 2023", delta_color="inverse")
    s3, s4 = st.columns(2)
    s3.metric("Custo de usina", "+30%", "+30%", delta_color="inverse")
    s4.metric("Impacto no payback GD", "Alta pressão")
    with st.container(border=True):
        st.markdown("""
**⚠️ Atenção:** custo de implantação sobe **~30%** — Fio B (60%) e alta dos painéis importados.

**Fio B:** de 15% (2023) → 60% (2026). Impacto direto no payback da GD.

**Solar flutuante em Itaipu:** 1.584 painéis — potencial para dobrar a capacidade da usina.
        """)
        st.caption("Fontes: Portal Solar · Canal Solar · Agência Brasil — mai/2026")
        d1, d2, d3 = st.columns(3)
        d1.link_button("🔗 Portal Solar", "https://www.portalsolar.com.br/noticias/mercado/brasil-deve-adicionar-10-6-gw-de-energia-solar-em-2026", use_container_width=True)
        d2.link_button("🔗 Canal Solar", "https://canalsolar.com.br/consumidores-60-do-fio-b-2026/", use_container_width=True)
        d3.link_button("🔗 Agência Brasil", "https://agenciabrasil.ebc.com.br/economia/noticia/2026-04/energia-solar-em-itaipu-tem-potencial-para-dobrar-capacidade-da-usina", use_container_width=True)

st.markdown("---")
st.caption("P3 Energy • Agenda ao vivo (Google Calendar) + Tempo ao vivo (Open-Meteo) + Mercado EV & Solar — mai/2026")
