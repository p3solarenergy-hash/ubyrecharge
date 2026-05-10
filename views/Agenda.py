"""
Agenda P3 Energy — Compromissos & Mercado EV/Solar
===================================================
Mostra Google Calendar embarcado + painel de notícias do mercado.
"""

import streamlit as st
import streamlit.components.v1 as components

from utils.p3_styles import inject, page_header, section_title

inject()

page_header(
    "📅 Agenda & Mercado",
    "Compromissos da equipe e panorama do mercado EV & Solar.",
)

# ─── GOOGLE CALENDAR ─────────────────────────────────────────────────────────

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

components.html(
    f"""
    <div style="border-radius:12px;overflow:hidden;border:1px solid #2A3530;">
      <iframe
        src="{CALENDAR_URL}"
        style="width:100%;height:520px;border:0;display:block;background:#16221E;"
        frameborder="0"
        scrolling="no">
      </iframe>
    </div>
    <p style="font-size:11px;color:#6A7F78;margin-top:6px;">
      ⚠️ Para exibir o calendário, acesse
      <a href="https://calendar.google.com/calendar/r/settings/calendar/{CALENDAR_EMAIL.replace('@','%40')}"
         target="_blank" style="color:#3FB66B;">
        Configurações do Google Calendar
      </a>
      → Configurações e compartilhamento → marque
      <strong>"Disponibilizar ao público"</strong>.
    </p>
    """,
    height=580,
)

st.markdown("---")

# ─── MERCADO EV ──────────────────────────────────────────────────────────────

section_title("⚡ Mercado de Veículos Elétricos — mai/2026")

ev_col1, ev_col2 = st.columns(2)
with ev_col1:
    st.metric("Crescimento 1T26 vs 1T25", "+88%", delta="+88%")
    st.metric("Emplacamentos 1T26", "95 mil unidades")
with ev_col2:
    st.metric("Projeção 2026", "280–300 mil unidades")
    st.metric("Participação mercado", "~15% (projeção)")

with st.container(border=True):
    st.markdown("""
**BYD Dolphin Mini** lidera com folga — mais de **50% das vendas** de elétricos puro no 1T26.
Preço agressivo e bom pacote de equipamentos consolidam o modelo como referência do segmento.

**MG Motor** anuncia novo elétrico para enfrentar BYD e Geely no Brasil em 2026.

**Seminovos elétricos** saem do estoque em menos de **40 dias** — alguns BEVs em menos de 20 dias, superando combustão.
""")
    st.caption("Fontes: ABVE · Reconecta News · Vrum · CNN Brasil — mai/2026")

    c1, c2, c3 = st.columns(3)
    c1.link_button("🔗 Reconecta News", "https://reconectanews.com.br/veiculos-eletrificados-no-brasil-podem-chegar-a-300-mil-vendas-em-2026/", use_container_width=True)
    c2.link_button("🔗 Vrum", "https://www.vrum.com.br/mercado/2026/04/7402036-os-5-carros-eletricos-mais-vendidos-do-brasil-no-1-trimestre-de-2026.html", use_container_width=True)
    c3.link_button("🔗 CNN Brasil", "https://www.cnnbrasil.com.br/auto/carros-eletricos-devem-ocupar-15-do-mercado-em-2026/", use_container_width=True)

st.markdown("---")

# ─── MERCADO SOLAR ───────────────────────────────────────────────────────────

section_title("☀️ Mercado Solar Fotovoltaico — mai/2026")

sol_col1, sol_col2 = st.columns(2)
with sol_col1:
    st.metric("Adições em 2026", "10,6 GW", delta="-7% vs 2025", delta_color="inverse")
    st.metric("Fio B 2026", "60%", delta="+45pp desde 2023", delta_color="inverse")
with sol_col2:
    st.metric("Custo de usina", "+30%", delta="+30%", delta_color="inverse")
    st.metric("Impacto no payback GD", "Alta", help="Pressão no Fio B e painéis importados")

with st.container(border=True):
    st.markdown("""
**⚠️ Atenção:** custo de implantação de usinas sobe **~30%** — puxado pela elevação do Fio B (60% em 2026)
e alta dos painéis importados. Pressão direta na precificação dos projetos.

**Fio B:** cobrança gradual desde 15% (2023) → 60% (2026). Impacto direto no payback da GD.

**Solar flutuante em Itaipu:** 1.584 painéis instalados sobre o lago — potencial para dobrar a capacidade.

**Solar na Amazônia:** projeto pioneiro viabiliza fábrica de gelo em comunidade ribeirinha de Iranduba (AM).
""")
    st.caption("Fontes: Portal Solar · Canal Solar · Movimento Econômico · Agência Brasil — mai/2026")

    d1, d2, d3 = st.columns(3)
    d1.link_button("🔗 Portal Solar", "https://www.portalsolar.com.br/noticias/mercado/brasil-deve-adicionar-10-6-gw-de-energia-solar-em-2026", use_container_width=True)
    d2.link_button("🔗 Canal Solar", "https://canalsolar.com.br/consumidores-60-do-fio-b-2026/", use_container_width=True)
    d3.link_button("🔗 Agência Brasil", "https://agenciabrasil.ebc.com.br/economia/noticia/2026-04/energia-solar-em-itaipu-tem-potencial-para-dobrar-capacidade-da-usina", use_container_width=True)

st.markdown("---")
st.caption("P3 Energy • Agenda ao vivo (Google Calendar) + Notícias EV & Solar — mai/2026")
