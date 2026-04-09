import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.excel_reader import get_all_projects, parse_full_project, EXCEL_DIR
from utils.calculations import calc_monthly, calc_sensitivity, safe_float

st.set_page_config(page_title="Análise | UBY RECHARGE", page_icon="🔬", layout="wide")
st.title("🔬 Análise e Sensibilidade")

files = get_all_projects()
selected = st.selectbox("Projeto base:", files, format_func=lambda x: x.replace(".xlsx", ""))
filepath = os.path.join(EXCEL_DIR, selected)

@st.cache_data(ttl=10)
def load_project(fp):
    return parse_full_project(fp)

project = load_project(filepath)
inputs = project["inputs"]

if not inputs:
    st.warning("Projeto sem aba Inputs compatível.")
    st.stop()

tabs = st.tabs(["📊 Análise de Sensibilidade", "🎯 Ponto de Equilíbrio", "📐 Simulador de Cenários"])

# ─────────────────────────────────────────────────
# TAB 1 — SENSIBILIDADE
# ─────────────────────────────────────────────────
with tabs[0]:
    st.markdown("### Sensibilidade por Ocupação")
    st.caption("Veja como EBITDA, Payback e Retorno variam com a ocupação dos carregadores.")

    sens = calc_sensitivity(inputs)
    df = pd.DataFrame(sens)

    col_a, col_b = st.columns(2)

    with col_a:
        st.markdown("#### EBITDA x Ocupação")
        occs = [float(r["Ocupação"].replace("%", "")) for r in sens]
        ebitdas = [r["EBITDA (R$)"] for r in sens]
        receitas = [r["Receita (R$)"] for r in sens]
        colors_bar = ["#00c8ff" if e >= 0 else "#ff4b4b" for e in ebitdas]

        fig = go.Figure()
        fig.add_trace(go.Bar(x=occs, y=ebitdas, name="EBITDA", marker_color=colors_bar))
        fig.add_trace(go.Scatter(x=occs, y=receitas, name="Receita", mode="lines",
                                 line=dict(color="#00e676", width=2)))
        fig.add_hline(y=0, line_dash="dash", line_color="#ff4b4b")
        fig.update_layout(height=340, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                          font_color="#e0e0e0", xaxis_title="Ocupação (%)",
                          yaxis_title="R$/mês", legend=dict(orientation="h", y=-0.2),
                          margin=dict(t=10, b=60))
        st.plotly_chart(fig, use_container_width=True)

    with col_b:
        st.markdown("#### Payback x Ocupação")
        paybacks = [float(str(r["Payback (meses)"]).replace("—", "999")) for r in sens]
        paybacks_display = [p if p < 999 else None for p in paybacks]

        fig2 = go.Figure()
        fig2.add_trace(go.Scatter(x=occs, y=paybacks_display, mode="lines+markers",
                                  line=dict(color="#ffa500", width=2),
                                  marker=dict(size=7)))
        fig2.update_layout(height=340, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                           font_color="#e0e0e0", xaxis_title="Ocupação (%)",
                           yaxis_title="Meses", margin=dict(t=10, b=40))
        st.plotly_chart(fig2, use_container_width=True)

    st.markdown("#### Tabela completa")
    st.dataframe(df, use_container_width=True, hide_index=True)

# ─────────────────────────────────────────────────
# TAB 2 — PONTO DE EQUILÍBRIO
# ─────────────────────────────────────────────────
with tabs[1]:
    st.markdown("### Ponto de Equilíbrio (Break-even)")

    def get_val(label):
        for k, v in inputs.items():
            if label.lower() in k.lower():
                return safe_float(v["value"])
        return 0.0

    n_dc = get_val("nº carregadores dc")
    n_ac = get_val("nº carregadores ac")
    pot_dc = get_val("potência por carregador dc")
    pot_ac = get_val("potência por carregador ac")
    horas = get_val("horas disponíveis por dia") or 24
    dias = get_val("dias por mês") or 30
    efic = get_val("eficiência") or 1.0
    preco_dc = get_val("preço venda dc")
    preco_ac = get_val("preço venda ac")
    custo_kwh = get_val("custo energia")
    pct_area = get_val("participação área")
    pct_gestao = get_val("gestão p3") or get_val("gestão")
    pct_imp = get_val("impostos sobre receita")
    custos_fixos = get_val("custo fixo") or get_val("custos fixos")
    capex = get_val("capex total")

    # Break-even: receita - custos variáveis - custos fixos = 0
    # receita = occ * kwh_max * preco
    # custo_var = receita * (pct_area + pct_gestao + pct_imp)
    # custo_energia = occ * kwh_max * custo_kwh
    # → receita*(1 - pct_var) = custo_energia + custos_fixos
    # → occ = custos_fixos / (kwh_max * (preco*(1-pct_var) - custo_kwh))

    kwh_max_dc = n_dc * pot_dc * horas * dias * efic
    kwh_max_ac = n_ac * pot_ac * horas * dias * efic
    pct_var = pct_area + pct_gestao + pct_imp

    # numerator: custos fixos
    # denominator: por unidade de ocupação: kwh_dc*(preco_dc*(1-pct_var) - custo_kwh) + kwh_ac*(preco_ac*(1-pct_var)-custo_kwh)
    denom_dc = kwh_max_dc * (preco_dc * (1 - pct_var) - custo_kwh)
    denom_ac = kwh_max_ac * (preco_ac * (1 - pct_var) - custo_kwh)
    denom = denom_dc + denom_ac

    be_occ = custos_fixos / denom if denom > 0 else None

    col1, col2 = st.columns(2)
    with col1:
        if be_occ is not None:
            st.metric("Ocupação mínima (break-even)", f"{be_occ*100:.1f}%")
            st.metric("Horas/dia no break-even", f"{horas * be_occ:.1f}h")
            receita_be = (kwh_max_dc * be_occ * preco_dc) + (kwh_max_ac * be_occ * preco_ac)
            st.metric("Receita no break-even", f"R$ {receita_be:,.0f}/mês")
        else:
            st.warning("Não é possível calcular o break-even com os dados atuais.")

    with col2:
        st.markdown("#### Margem de segurança")
        m = calc_monthly(inputs)
        occ_atual = get_val("ocupação dc inicial") or 0.3
        if be_occ:
            margem_seg = (occ_atual - be_occ) / occ_atual * 100 if occ_atual > 0 else 0
            st.metric("Ocupação atual", f"{occ_atual*100:.0f}%")
            st.metric("Break-even", f"{be_occ*100:.1f}%")
            st.metric("Margem de segurança", f"{margem_seg:.1f}%",
                      delta=f"{'acima' if margem_seg > 0 else 'abaixo'} do mínimo")

    # Gauge
    if be_occ is not None:
        fig = go.Figure(go.Indicator(
            mode="gauge+number+delta",
            value=occ_atual * 100,
            number={"suffix": "%"},
            delta={"reference": be_occ * 100, "suffix": "%"},
            title={"text": "Ocupação Atual vs Break-even"},
            gauge={
                "axis": {"range": [0, 100]},
                "bar": {"color": "#00c8ff"},
                "steps": [
                    {"range": [0, be_occ * 100], "color": "#ff4b4b"},
                    {"range": [be_occ * 100, 100], "color": "#1a3a2a"},
                ],
                "threshold": {
                    "line": {"color": "#ffd700", "width": 3},
                    "thickness": 0.75,
                    "value": be_occ * 100,
                },
            }
        ))
        fig.update_layout(height=320, paper_bgcolor="#0f1117", font_color="#e0e0e0",
                          margin=dict(t=30, b=10))
        st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────────────────────────────
# TAB 3 — SIMULADOR DE CENÁRIOS
# ─────────────────────────────────────────────────
with tabs[2]:
    st.markdown("### Simulador — Comparar 3 Cenários")
    st.caption("Defina Pessimista / Conservador / Otimista e compare os resultados.")

    c1, c2, c3 = st.columns(3)
    cenarios = {}

    with c1:
        st.markdown("#### 🔴 Pessimista")
        cenarios["Pessimista"] = {
            "ocupacao": st.slider("Ocupação", 0, 100, 20, key="occ_p") / 100,
            "preco_dc": st.number_input("Preço DC (R$/kWh)", value=1.69, key="pdc_p"),
            "custo_kwh": st.number_input("Custo energia (R$/kWh)", value=0.98, key="ck_p"),
        }

    with c2:
        st.markdown("#### 🟡 Conservador")
        cenarios["Conservador"] = {
            "ocupacao": st.slider("Ocupação", 0, 100, 35, key="occ_c") / 100,
            "preco_dc": st.number_input("Preço DC (R$/kWh)", value=1.89, key="pdc_c"),
            "custo_kwh": st.number_input("Custo energia (R$/kWh)", value=0.88, key="ck_c"),
        }

    with c3:
        st.markdown("#### 🟢 Otimista")
        cenarios["Otimista"] = {
            "ocupacao": st.slider("Ocupação", 0, 100, 55, key="occ_o") / 100,
            "preco_dc": st.number_input("Preço DC (R$/kWh)", value=2.09, key="pdc_o"),
            "custo_kwh": st.number_input("Custo energia (R$/kWh)", value=0.78, key="ck_o"),
        }

    results = []
    for nome, cfg in cenarios.items():
        mod_inputs = {}
        for label, info in inputs.items():
            mod_inputs[label] = {"value": info["value"], "unit": info.get("unit", "")}
            if "ocupação dc inicial" in label.lower():
                mod_inputs[label]["value"] = cfg["ocupacao"]
            if "preço venda dc" in label.lower():
                mod_inputs[label]["value"] = cfg["preco_dc"]
            if "custo energia" in label.lower():
                mod_inputs[label]["value"] = cfg["custo_kwh"]

        m = calc_monthly(mod_inputs)
        results.append({
            "Cenário": nome,
            "Receita/mês (R$)": m["receita"],
            "EBITDA/mês (R$)": m["ebitda"],
            "Margem EBITDA": f"{m['margem_ebitda']*100:.1f}%",
            "Payback (meses)": round(m["payback_meses"], 1) if m.get("payback_meses") else "—",
            "Retorno a.m.": f"{m['retorno_am']*100:.2f}%",
        })

    df_cen = pd.DataFrame(results)
    st.markdown("#### Resultado dos cenários")
    st.dataframe(df_cen, use_container_width=True, hide_index=True)

    # Gráfico comparativo
    fig = go.Figure()
    cen_colors = {"Pessimista": "#ff4b4b", "Conservador": "#ffa500", "Otimista": "#00e676"}
    for r in results:
        fig.add_trace(go.Bar(
            name=r["Cenário"],
            x=["Receita/mês", "EBITDA/mês"],
            y=[r["Receita/mês (R$)"], r["EBITDA/mês (R$)"]],
            marker_color=cen_colors[r["Cenário"]],
        ))
    fig.update_layout(barmode="group", height=320, paper_bgcolor="#0f1117",
                      plot_bgcolor="#0f1117", font_color="#e0e0e0",
                      yaxis_title="R$/mês", legend=dict(orientation="h", y=-0.15),
                      margin=dict(t=10, b=60))
    st.plotly_chart(fig, use_container_width=True)
