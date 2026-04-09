import os
import sys

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.calculations import calc_annual_projection, calc_monthly, calc_sensitivity
from utils.excel_reader import EXCEL_DIR, get_all_projects, parse_full_project, save_inputs_to_excel
from utils.manager_auth import is_manager_authenticated

st.set_page_config(page_title="Projetos | UBY RECHARGE", page_icon="📁", layout="wide")
st.title("📁 Projetos")

files = get_all_projects()
if not files:
    st.error("Nenhuma planilha encontrada.")
    st.stop()

selected = st.selectbox("Selecione o projeto:", files, format_func=lambda name: name.replace(".xlsx", ""))
filepath = os.path.join(EXCEL_DIR, selected)
is_manager = is_manager_authenticated()


@st.cache_data(ttl=10)
def load_project(path):
    return parse_full_project(path)


project = load_project(filepath)
inputs = project["inputs"]

if not inputs:
    st.warning("Esta planilha não tem aba 'Inputs' compatível.")
    st.stop()

tabs = st.tabs(["✏️ Inputs", "📈 Projeção Anual", "🔍 Cenários", "💰 Orçamento CAPEX"])

with tabs[0]:
    st.markdown("### Editar Inputs do Projeto")
    st.caption("Os parâmetros operacionais ficam disponíveis para toda a equipe. Campos financeiros ficam na Área do Gestor.")

    col_edit, col_kpis = st.columns([2, 1])

    with col_edit:
        edited = {}
        groups = {"Operação": ["carregadores", "Potência", "vagas", "Horas", "Dias", "Eficiência", "Capacidade"]}
        if is_manager:
            groups.update(
                {
                    "Finanças": ["CAPEX", "Taxa", "Horizonte", "reposição"],
                    "Preços": ["Preço", "venda", "Custo energia"],
                    "Custos (%)": ["Participação", "Gestão", "Impostos", "custo fixo", "Custos fixos"],
                }
            )

        for group, keywords in groups.items():
            with st.expander(f"**{group}**", expanded=(group == "Operação")):
                for label, info in inputs.items():
                    if any(keyword.lower() in label.lower() for keyword in keywords):
                        try:
                            current_value = float(info["value"]) if info["value"] is not None else 0.0
                        except (TypeError, ValueError):
                            current_value = 0.0

                        edited[label] = st.number_input(
                            f"{label} ({info.get('unit', '')})" if info.get("unit") else label,
                            value=current_value,
                            key=f"input_{label}",
                            format="%.4f" if 0 < current_value < 1 else "%.2f",
                        )

        if st.button("💾 Salvar no Excel", type="primary"):
            ok = save_inputs_to_excel(filepath, edited)
            if ok:
                st.success("Planilha atualizada com sucesso.")
                st.cache_data.clear()
                st.rerun()
            else:
                st.error("Não foi possível salvar. Verifique se o arquivo está aberto no Excel.")

        if not is_manager:
            st.info("Preços, custos de implantação, CAPEX e estrutura financeira ficam bloqueados na Área do Gestor.")

    with col_kpis:
        live_inputs = {
            label: {"value": edited.get(label, info["value"]), "unit": info.get("unit", "")}
            for label, info in inputs.items()
        }
        monthly = calc_monthly(live_inputs)
        st.markdown("#### KPIs em tempo real")
        st.metric("Receita mensal", f"R$ {monthly['receita']:,.0f}")
        st.metric("EBITDA mensal", f"R$ {monthly['ebitda']:,.0f}")
        st.metric("Margem EBITDA", f"{monthly['margem_ebitda'] * 100:.1f}%")
        if is_manager:
            payback = monthly.get("payback_meses")
            st.metric("Payback", f"{payback:.1f} meses" if payback else "—")
            st.metric("Retorno a.m.", f"{monthly['retorno_am'] * 100:.2f}%")
            st.metric("CAPEX", f"R$ {monthly['capex']:,.0f}")
        else:
            st.info("KPIs de implantação e retorno ficam bloqueados para o gestor.")

with tabs[1]:
    st.markdown("### Projeção Anual")
    projection_inputs = {
        label: {"value": inputs[label]["value"], "unit": inputs[label].get("unit", "")}
        for label in inputs
    }
    years = st.slider("Horizonte (anos)", 1, 15, 10)
    projection = pd.DataFrame(calc_annual_projection(projection_inputs, anos=years))

    fig = go.Figure()
    fig.add_trace(go.Bar(name="EBITDA", x=projection["Ano"], y=projection["EBITDA"], marker_color="#00c8ff"))
    if is_manager:
        fig.add_trace(go.Bar(name="Custo Energia", x=projection["Ano"], y=projection["Custo Energia"], marker_color="#ff6b6b"))
        fig.add_trace(
            go.Bar(name="Custos Variáveis", x=projection["Ano"], y=projection["Custos Variáveis"], marker_color="#ffa500")
        )
        fig.add_trace(go.Bar(name="Custos Fixos", x=projection["Ano"], y=projection["Custos Fixos"], marker_color="#888"))
    fig.add_trace(
        go.Scatter(name="Receita", x=projection["Ano"], y=projection["Receita"], mode="lines+markers", line=dict(color="#00e676"))
    )
    fig.update_layout(
        barmode="stack" if is_manager else "group",
        height=380,
        paper_bgcolor="#0f1117",
        plot_bgcolor="#0f1117",
        font_color="#e0e0e0",
        legend=dict(orientation="h", y=-0.15),
        margin=dict(t=10, b=60),
    )
    st.plotly_chart(fig, use_container_width=True)
    st.dataframe(projection, use_container_width=True, hide_index=True)

with tabs[2]:
    st.markdown("### Sensibilidade por Ocupação")
    sensitivity = pd.DataFrame(calc_sensitivity(inputs))
    if not is_manager:
        visible_columns = [column for column in sensitivity.columns if "Payback" not in column and "Retorno" not in column]
        sensitivity = sensitivity[visible_columns]
        st.info("Payback e retorno ficam disponíveis apenas na Área do Gestor.")
    st.dataframe(sensitivity, use_container_width=True, hide_index=True)

with tabs[3]:
    st.markdown("### Orçamento CAPEX")
    if not is_manager:
        st.warning("🔒 Orçamento de implantação disponível apenas na Área do Gestor.")
    elif project["budget"] is not None:
        if project["capex_total"]:
            st.metric("CAPEX Total", f"R$ {project['capex_total']:,.2f}")
        st.dataframe(project["budget"], use_container_width=True, hide_index=True)
    else:
        st.info("Esta planilha não possui aba de orçamento compatível.")
