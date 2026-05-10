"""
Resumo de Implantação — dados ao vivo via Google Sheets API
"""
import streamlit as st

from utils.p3_styles import inject, page_header, section_title, badge
from utils.sheets_connector import get_project_data, is_configured, SPREADSHEETS

inject()

page_header(
    "📍 Resumo de Implantação",
    "Dados ao vivo das planilhas de viabilidade — Rio Beach V12.",
)

# ── Banner de configuração ─────────────────────────────────────────────────────
if not is_configured():
    st.warning(
        "**Google Sheets não configurado.**  \n"
        "Adicione as credenciais da Service Account em `.streamlit/secrets.toml` "
        "(use o arquivo `.streamlit/secrets.toml.example` como guia) e compartilhe "
        "a planilha com o e-mail da conta de serviço como **Leitor**.",
        icon="🔑",
    )
    with st.expander("ℹ️  Como configurar passo a passo"):
        st.markdown("""
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie ou selecione um projeto
3. Ative **Google Sheets API** e **Google Drive API**
4. Em **IAM & Admin → Service Accounts**, crie uma conta e baixe a chave **JSON**
5. Copie o conteúdo do JSON para `.streamlit/secrets.toml` (veja o arquivo `.example`)
6. Abra a planilha Rio Beach V12 e compartilhe com o e-mail `client_email` como **Leitor**
7. Reinicie o app

O secrets.toml **não** deve ser comitado no Git (já está no .gitignore).
        """)
    st.stop()

# ── Carrega dados ──────────────────────────────────────────────────────────────
with st.spinner("Buscando dados da planilha…"):
    try:
        proj = get_project_data("rio_beach_v12")
    except RuntimeError as err:
        st.error(f"❌ {err}", icon="🚨")
        st.stop()

if proj is None:
    st.info("Nenhum dado retornado.", icon="📍")
    st.stop()

op  = proj["operational"]
inv = proj["investment"]
fin = proj["finance"]
occ = proj["occupancy"]
pri = proj["pricing"]

# ── KPIs principais ────────────────────────────────────────────────────────────
section_title("📊 Indicadores do Projeto — " + proj["name"])

k1, k2, k3, k4 = st.columns(4)

with k1:
    with st.container(border=True):
        st.metric(
            "CAPEX Total",
            f"R$ {inv['capex_total']:,.0f}".replace(",", "."),
            help="Investimento base para retorno (Inputs!B18)",
        )

with k2:
    with st.container(border=True):
        st.metric(
            "Potência Total",
            f"{op['power_total_kw']:.0f} kW",
            help="Potência instalada — somados DC + AC (Inputs!B10)",
        )

with k3:
    with st.container(border=True):
        st.metric(
            "Receita Mensal (base)",
            f"R$ {fin['revenue_monthly']:,.0f}".replace(",", "."),
            help="Cenário base — kWh + ativações (Inputs!D133)",
        )

with k4:
    with st.container(border=True):
        payback = fin["payback_months"]
        pb_str  = f"{payback:.1f} meses" if payback else "—"
        st.metric(
            "Payback Simples",
            pb_str,
            help="CAPEX ÷ EBITDA mensal (cenário base)",
        )

st.markdown("")

# ── Card detalhado ─────────────────────────────────────────────────────────────
section_title("⚡ Rio Beach — Detalhamento")

col_esq, col_dir = st.columns([1.3, 1])

with col_esq:
    with st.container(border=True):
        st.markdown("#### 🏗️ Infraestrutura")
        c1, c2 = st.columns(2)
        with c1:
            st.metric("Carregadores DC",  op["chargers_dc"])
            st.metric("Potência DC",       f"{op['power_dc_kw']:.0f} kW")
        with c2:
            st.metric("Carregadores AC",  op["chargers_ac"])
            st.metric("Potência AC",       f"{op['power_ac_kw']:.0f} kW")

    with st.container(border=True):
        st.markdown("#### 📈 Ocupação & Preços (Cenário Base)")
        c1, c2, c3 = st.columns(3)
        with c1:
            st.metric("Ocup. DC",  f"{occ['dc_pct']:.0%}")
        with c2:
            st.metric("Ocup. AC",  f"{occ['ac_pct']:.0%}")
        with c3:
            st.metric("kWh/mês",   f"{fin['energy_kwh_monthly']:,.0f}".replace(",", "."))
        c4, c5 = st.columns(2)
        with c4:
            st.metric("Preço DC",  f"R$ {pri['sale_price_dc']:.2f}".replace(".", ","))
        with c5:
            st.metric("Preço AC",  f"R$ {pri['sale_price_ac']:.2f}".replace(".", ","))

with col_dir:
    with st.container(border=True):
        st.markdown("#### 💰 DRE Mensal — Cenário Base")

        ebitda   = fin["ebitda_monthly"]
        receita  = fin["revenue_monthly"]
        margem   = (ebitda / receita * 100) if receita else 0
        custo_en = pri["energy_cost"] * fin["energy_kwh_monthly"]

        st.metric("Receita Total",  f"R$ {receita:,.0f}".replace(",", "."))
        st.metric(
            "Custo Energia",
            f"R$ {custo_en:,.0f}".replace(",", "."),
            delta=f"-{custo_en/receita:.1%} da receita" if receita else None,
            delta_color="inverse",
        )
        st.metric(
            "EBITDA",
            f"R$ {ebitda:,.0f}".replace(",", "."),
            delta=f"Margem {margem:.1f}%",
            delta_color="normal",
        )

    with st.container(border=True):
        st.markdown("#### 🎯 Retorno")
        st.metric("CAPEX Base",     f"R$ {inv['capex_total']:,.0f}".replace(",", "."))
        pb = fin["payback_months"]
        st.metric("Payback Simples", f"{pb:.1f} meses" if pb else "—")
        roi_am = (ebitda / inv["capex_total"] * 100) if inv["capex_total"] else 0
        st.metric("ROI a.m. (base)", f"{roi_am:.2f}%")

# ── Link para planilha ──────────────────────────────────────────────────────────
st.markdown("")
st.markdown(
    f"📄 [Abrir planilha Rio Beach V12 no Google Sheets]({proj['spreadsheet_url']})",
    unsafe_allow_html=False,
)

# ── Status da integração ────────────────────────────────────────────────────────
st.markdown("")
st.caption(
    "P3 Energy • Dados sincronizados via Google Sheets API · "
    "Cache de 5 min · Planilha: RIO BEACH EV -V12"
)
