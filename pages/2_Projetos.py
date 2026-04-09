import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.excel_reader import get_all_projects, parse_full_project, save_inputs_to_excel, EXCEL_DIR
from utils.calculations import calc_monthly, calc_annual_projection, calc_sensitivity

st.set_page_config(page_title="Projetos | UBY RECHARGE", page_icon="📁", layout="wide")
st.title("📁 Projetos")

files = get_all_projects()
if not files:
    st.error("Nenhuma planilha encontrada.")
    st.stop()

selected = st.selectbox("Selecione o projeto:", files, format_func=lambda x: x.replace(".xlsx", ""))
filepath = os.path.join(EXCEL_DIR, selected)

@st.cache_data(ttl=10)
def load_project(fp):
    return parse_full_project(fp)

project = load_project(filepath)
inputs = project["inputs"]

if not inputs:
    st.warning("Esta planilha não tem aba 'Inputs' compatível.")
    st.stop()

tabs = st.tabs(["✏️ Inputs", "📈 Projeção Anual", "🔍 Cenários", "💰 Orçamento CAPEX"])

# ─────────────────────────────────────────────────
# TAB 1 — INPUTS EDITÁVEIS
# ─────────────────────────────────────────────────
with tabs[0]:
    st.markdown("### Editar Inputs do Projeto")
    st.caption("Edite os valores abaixo e clique em **Salvar** para atualizar a planilha.")

    col_edit, col_kpis = st.columns([2, 1])

    with col_edit:
        edited = {}
        groups = {
            "Operação": ["carregadores", "Potência", "vagas", "Horas", "Dias", "Eficiência", "Capacidade"],
            "Finanças": ["CAPEX", "Taxa", "Horizonte", "reposição"],
            "Preços": ["Preço", "venda", "Custo energia"],
            "Custos (%)": ["Participação", "Gestão", "Impostos", "custo fixo", "Custos fixos"],
        }

        for group, keywords in groups.items():
            with st.expander(f"**{group}**", expanded=(group == "Operação")):
                for label, info in inputs.items():
                    if any(k.lower() in label.lower() for k in keywords):
                        val = info["value"]
                        unit = info.get("unit", "")
                        try:
                            float_val = float(val) if val is not None else 0.0
                        except (TypeError, ValueError):
                            float_val = 0.0

                        new_val = st.number_input(
                            f"{label} ({unit})" if unit else label,
                            value=float_val,
                            key=f"input_{label}",
                            format="%.4f" if float_val < 1 and float_val > 0 else "%.2f",
                        )
                        edited[label] = new_val

        if st.button("💾 Salvar no Excel", type="primary"):
            ok = save_inputs_to_excel(filepath, edited)
            if ok:
                st.success("Planilha atualizada com sucesso!")
                st.cache_data.clear()
                st.rerun()
            else:
                st.error("Não foi possível salvar. Verifique se o arquivo está aberto no Excel.")

    with col_kpis:
        # Recalcula com os valores editados
        live_inputs = {}
        for label, info in inputs.items():
            if label in edited:
                live_inputs[label] = {"value": edited[label], "unit": info.get("unit", "")}
            else:
                live_inputs[label] = info

        m = calc_monthly(live_inputs)
        st.markdown("#### KPIs em tempo real")
        st.metric("Receita mensal", f"R$ {m['receita']:,.0f}")
        st.metric("EBITDA mensal", f"R$ {m['ebitda']:,.0f}")
        st.metric("Margem EBITDA", f"{m['margem_ebitda']*100:.1f}%")
        pb = m.get("payback_meses")
        st.metric("Payback", f"{pb:.1f} meses" if pb else "—")
        st.metric("Retorno a.m.", f"{m['retorno_am']*100:.2f}%")
        st.metric("CAPEX", f"R$ {m['capex']:,.0f}")

        # Mini waterfall
        st.markdown("#### Composição do resultado")
        labels = ["Receita", "- Energia", "- Custos Var.", "- Fixos", "EBITDA"]
        values = [m["receita"], -m["custo_energia"], -m["custo_variavel"], -m["custos_fixos"], m["ebitda"]]
        colors = ["#00c8ff", "#ff6b6b", "#ffa500", "#888", "#00e676"]
        fig = go.Figure(go.Bar(x=labels, y=values, marker_color=colors))
        fig.update_layout(height=260, margin=dict(t=10, b=10, l=0, r=0),
                          paper_bgcolor="#1e2130", plot_bgcolor="#1e2130",
                          font_color="#e0e0e0", showlegend=False)
        st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────────────────────────────
# TAB 2 — PROJEÇÃO ANUAL
# ─────────────────────────────────────────────────
with tabs[1]:
    st.markdown("### Projeção Anual (10 anos)")

    live_inputs2 = {}
    for label, info in inputs.items():
        if label in edited:
            live_inputs2[label] = {"value": edited.get(label, info["value"]), "unit": info.get("unit", "")}
        else:
            live_inputs2[label] = info

    anos = st.slider("Horizonte (anos)", 1, 15, 10)
    proj = calc_annual_projection(live_inputs2, anos=anos)
    df_proj = pd.DataFrame(proj)

    # Métricas de destaque
    ultimo = df_proj.iloc[-1]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric(f"Receita Ano {anos}", f"R$ {ultimo['Receita']:,.0f}")
    c2.metric(f"EBITDA Ano {anos}", f"R$ {ultimo['EBITDA']:,.0f}")
    c3.metric(f"Margem Ano {anos}", f"{ultimo['Margem EBITDA']:.1f}%")
    fluxo_pos = df_proj[df_proj["Fluxo Acumulado"] > 0]
    payback_ano = fluxo_pos.iloc[0]["Ano"] if not fluxo_pos.empty else ">"
    c4.metric("Payback Break-even", payback_ano)

    # Gráfico de barras empilhadas
    fig = go.Figure()
    fig.add_trace(go.Bar(name="Custo Energia", x=df_proj["Ano"], y=df_proj["Custo Energia"],
                         marker_color="#ff6b6b"))
    fig.add_trace(go.Bar(name="Custos Variáveis", x=df_proj["Ano"], y=df_proj["Custos Variáveis"],
                         marker_color="#ffa500"))
    fig.add_trace(go.Bar(name="Custos Fixos", x=df_proj["Ano"], y=df_proj["Custos Fixos"],
                         marker_color="#888"))
    fig.add_trace(go.Bar(name="EBITDA", x=df_proj["Ano"], y=df_proj["EBITDA"],
                         marker_color="#00c8ff"))
    fig.add_trace(go.Scatter(name="Receita", x=df_proj["Ano"], y=df_proj["Receita"],
                             mode="lines+markers", line=dict(color="#00e676", width=2),
                             marker=dict(size=8)))
    fig.update_layout(barmode="stack", height=380, paper_bgcolor="#0f1117",
                      plot_bgcolor="#0f1117", font_color="#e0e0e0",
                      legend=dict(orientation="h", y=-0.15),
                      margin=dict(t=10, b=60))
    st.plotly_chart(fig, use_container_width=True)

    # Fluxo acumulado
    st.markdown("#### Fluxo de Caixa Acumulado")
    fig2 = go.Figure()
    fig2.add_trace(go.Scatter(x=df_proj["Ano"], y=df_proj["Fluxo Acumulado"],
                              fill="tozeroy", mode="lines+markers",
                              line=dict(color="#00c8ff", width=2),
                              fillcolor="rgba(0,200,255,0.15)"))
    fig2.add_hline(y=0, line_dash="dash", line_color="#ff4b4b")
    fig2.update_layout(height=280, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                       font_color="#e0e0e0", margin=dict(t=10, b=40),
                       yaxis_title="R$")
    st.plotly_chart(fig2, use_container_width=True)

    # Tabela detalhada
    st.markdown("#### Tabela detalhada")
    st.dataframe(
        df_proj.style.format({
            "Receita": "R$ {:,.0f}",
            "Custo Energia": "R$ {:,.0f}",
            "Custos Variáveis": "R$ {:,.0f}",
            "Custos Fixos": "R$ {:,.0f}",
            "EBITDA": "R$ {:,.0f}",
            "Fluxo Acumulado": "R$ {:,.0f}",
            "Ocupação DC": "{:.1f}%",
            "Margem EBITDA": "{:.1f}%",
        }),
        use_container_width=True,
        hide_index=True,
    )

# ─────────────────────────────────────────────────
# TAB 3 — CENÁRIOS DE OCUPAÇÃO
# ─────────────────────────────────────────────────
with tabs[2]:
    st.markdown("### Sensibilidade por Ocupação")
    st.caption("Como os resultados variam de acordo com a taxa de ocupação dos carregadores.")

    live_inputs3 = {}
    for label, info in inputs.items():
        v = edited.get(label, info["value"])
        live_inputs3[label] = {"value": v, "unit": info.get("unit", "")}

    sens = calc_sensitivity(live_inputs3)
    df_sens = pd.DataFrame(sens)

    # Highlight breakeven row
    highlight_occ = st.slider("Ocupação atual (%)", 0, 100, 30, step=5)

    fig = go.Figure()
    occs = [float(r["Ocupação"].replace("%", "")) for r in sens]
    ebitdas = [r["EBITDA (R$)"] for r in sens]
    receitas = [r["Receita (R$)"] for r in sens]

    fig.add_trace(go.Scatter(x=occs, y=receitas, name="Receita", mode="lines",
                             line=dict(color="#00e676", width=2)))
    fig.add_trace(go.Scatter(x=occs, y=ebitdas, name="EBITDA", mode="lines",
                             line=dict(color="#00c8ff", width=2), fill="tozeroy",
                             fillcolor="rgba(0,200,255,0.12)"))
    fig.add_vline(x=highlight_occ, line_dash="dot", line_color="#ffd700",
                  annotation_text=f"Ocupação atual: {highlight_occ}%",
                  annotation_font_color="#ffd700")
    fig.add_hline(y=0, line_dash="dash", line_color="#ff4b4b")
    fig.update_layout(height=350, paper_bgcolor="#0f1117", plot_bgcolor="#0f1117",
                      font_color="#e0e0e0", legend=dict(orientation="h", y=-0.15),
                      xaxis_title="Ocupação (%)", yaxis_title="R$/mês",
                      margin=dict(t=10, b=60))
    st.plotly_chart(fig, use_container_width=True)

    if project["scenarios"] is not None:
        st.markdown("#### Tabela de cenários (do Excel)")
        st.dataframe(project["scenarios"], use_container_width=True, hide_index=True)
    else:
        st.markdown("#### Tabela calculada")
        st.dataframe(df_sens, use_container_width=True, hide_index=True)

# ─────────────────────────────────────────────────
# TAB 4 — ORÇAMENTO CAPEX
# ─────────────────────────────────────────────────
with tabs[3]:
    st.markdown("### Orçamento CAPEX")

    if project["budget"] is not None:
        df_budget = project["budget"].copy()
        capex_total = project["capex_total"]

        if capex_total:
            st.metric("CAPEX Total", f"R$ {capex_total:,.2f}")

        st.markdown("#### Itens de orçamento")
        st.dataframe(df_budget, use_container_width=True, hide_index=True)

        # Gráfico por categoria (se coluna Categoria existir)
        cat_col = None
        for c in df_budget.columns:
            if "categ" in str(c).lower():
                cat_col = c
                break
        total_col = None
        for c in df_budget.columns:
            if "total" in str(c).lower():
                total_col = c
                break

        if cat_col and total_col:
            df_cat = df_budget.groupby(cat_col)[total_col].sum().reset_index()
            df_cat = df_cat[df_cat[total_col] > 0]
            if not df_cat.empty:
                fig = px.pie(df_cat, names=cat_col, values=total_col,
                             title="Composição do CAPEX por Categoria",
                             color_discrete_sequence=px.colors.sequential.Teal)
                fig.update_layout(paper_bgcolor="#0f1117", font_color="#e0e0e0",
                                  margin=dict(t=40, b=10))
                st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Esta planilha não possui aba de Orçamento compatível.")
