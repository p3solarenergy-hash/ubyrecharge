"""
Gastos da Obra — input de despesas por projeto + exportação para planilha
"""
import datetime
import io

import pandas as pd
import streamlit as st

from utils.p3_styles import inject, page_header, section_title

inject()

# ─── DADOS INICIAIS (substituir por Supabase futuramente) ──────────────────
OBRAS = ["Rio Beach EV — Rio de Janeiro", "Posto Malassise R.K. — Maringá"]

CATEGORIAS = [
    "Material elétrico",
    "Mão de obra",
    "Equipamento / carregador",
    "Civil / construção",
    "Projeto / engenharia",
    "Taxas e licenças",
    "Transporte / logística",
    "Outros",
]

# Dados de exemplo — serão substituídos por dados reais do Supabase
GASTOS_EXEMPLO = [
    {"obra": "Rio Beach EV — Rio de Janeiro", "data": "10/03/2026", "categoria": "Projeto / engenharia",   "descricao": "Elaboração do projeto executivo",        "fornecedor": "P3 Energy",        "valor": 3500.00},
    {"obra": "Rio Beach EV — Rio de Janeiro", "data": "15/04/2026", "categoria": "Material elétrico",      "descricao": "Cabo 35mm² 50m + disjuntores",           "fornecedor": "Elétrica Central", "valor": 2180.00},
    {"obra": "Rio Beach EV — Rio de Janeiro", "data": "20/04/2026", "categoria": "Taxas e licenças",       "descricao": "Taxa protocolo ENEL",                    "fornecedor": "ENEL RJ",          "valor": 420.00},
    {"obra": "Posto Malassise R.K. — Maringá", "data": "02/05/2026","categoria": "Projeto / engenharia",   "descricao": "Análise de carga — analisador DMI P1000R","fornecedor": "ISSO Telecom",     "valor": 1200.00},
    {"obra": "Posto Malassise R.K. — Maringá", "data": "02/05/2026","categoria": "Projeto / engenharia",   "descricao": "Elaboração dos relatórios técnicos",     "fornecedor": "P3 Energy",        "valor": 800.00},
]

# Armazena novos gastos na sessão (até Supabase estar integrado)
if "gastos" not in st.session_state:
    st.session_state["gastos"] = GASTOS_EXEMPLO.copy()

# ─── PÁGINA ───────────────────────────────────────────────────────────────────
page_header(
    "💰 Gastos da Obra",
    "Registre despesas por projeto. Exporte para planilha a qualquer momento.",
)

obra_sel = st.selectbox("Selecione a obra", OBRAS, label_visibility="collapsed")

# Filtra gastos da obra selecionada
gastos_obra = [g for g in st.session_state["gastos"] if g["obra"] == obra_sel]
df = pd.DataFrame(gastos_obra) if gastos_obra else pd.DataFrame(
    columns=["obra", "data", "categoria", "descricao", "fornecedor", "valor"]
)

# ── Métricas resumo ──────────────────────────────────────────────────────────
total_gasto = df["valor"].sum() if not df.empty else 0
n_lancamentos = len(df)

ORCAMENTO = 25000.0  # placeholder — conectar ao Supabase / CAPEX depois
saldo = ORCAMENTO - total_gasto
pct = total_gasto / ORCAMENTO if ORCAMENTO else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Total gasto",    f"R$ {total_gasto:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
c2.metric("Orçamento",      f"R$ {ORCAMENTO:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
c3.metric("Saldo restante", f"R$ {saldo:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
c4.metric("Lançamentos",    n_lancamentos)

cor_barra = "#E55545" if pct > 0.9 else "#F2A93D" if pct > 0.7 else "#3FB66B"
st.markdown(
    f"""<div style='background:#2A3530;border-radius:8px;height:10px;margin:8px 0 16px'>
    <div style='background:{cor_barra};width:{min(pct*100,100):.1f}%;height:10px;border-radius:8px'></div>
    </div>
    <p style='color:var(--p3-muted);font-size:12px;margin-bottom:16px'>
    {pct*100:.1f}% do orçamento utilizado</p>""",
    unsafe_allow_html=True,
)

st.markdown("---")

# ── Formulário de novo gasto ─────────────────────────────────────────────────
section_title("Registrar Gasto")

with st.form("form_gasto", clear_on_submit=True):
    col_a, col_b = st.columns([3, 1])
    descricao  = col_a.text_input("Descrição *")
    categoria  = col_b.selectbox("Categoria *", CATEGORIAS)

    col_c, col_d, col_e = st.columns([1.5, 2, 1.5])
    valor      = col_c.number_input("Valor (R$) *", min_value=0.0, step=50.0, format="%.2f")
    fornecedor = col_d.text_input("Fornecedor / prestador")
    data_gasto = col_e.date_input("Data *", value=datetime.date.today())

    obs = st.text_area("Observações (opcional)", height=60)
    salvar = st.form_submit_button("💾 Salvar Gasto", type="primary", use_container_width=True)

    if salvar:
        if not descricao or valor <= 0:
            st.error("Preencha ao menos a descrição e o valor.")
        else:
            novo = {
                "obra": obra_sel,
                "data": data_gasto.strftime("%d/%m/%Y"),
                "categoria": categoria,
                "descricao": descricao,
                "fornecedor": fornecedor,
                "valor": valor,
            }
            st.session_state["gastos"].append(novo)
            st.success(f"✅ Gasto de R$ {valor:,.2f} registrado com sucesso!")
            st.rerun()

st.markdown("---")

# ── Tabela de gastos ──────────────────────────────────────────────────────────
section_title("Lançamentos")

if df.empty:
    st.info("Nenhum gasto registrado para esta obra ainda.")
else:
    df_exib = df[["data", "categoria", "descricao", "fornecedor", "valor"]].copy()
    df_exib.columns = ["Data", "Categoria", "Descrição", "Fornecedor", "Valor (R$)"]
    df_exib["Valor (R$)"] = df_exib["Valor (R$)"].apply(lambda v: f"R$ {v:,.2f}".replace(",","X").replace(".",",").replace("X","."))
    st.dataframe(df_exib, use_container_width=True, hide_index=True)

    # ── Gasto por categoria ───────────────────────────────────────────────────
    import plotly.express as px
    section_title("Por Categoria")
    cat_group = df.groupby("categoria")["valor"].sum().reset_index()
    cat_group.columns = ["Categoria", "Total"]
    fig = px.pie(
        cat_group, names="Categoria", values="Total",
        hole=0.45,
        color_discrete_sequence=["#3FB66B","#5BC882","#0F3D2E","#FFD66B","#F2A93D","#8FA39A","#E55545","#7FCCFF"],
    )
    fig.update_layout(
        height=320, paper_bgcolor="#16221E", plot_bgcolor="#16221E",
        font_color="#E8EFEB", legend=dict(orientation="h", yanchor="top", y=-0.1),
        margin=dict(t=10, b=10),
    )
    st.plotly_chart(fig, use_container_width=True)

    st.markdown("---")

    # ── Exportar para CSV ─────────────────────────────────────────────────────
    section_title("Exportar")
    df_export = df[["data", "categoria", "descricao", "fornecedor", "valor"]].copy()
    df_export.columns = ["Data", "Categoria", "Descrição", "Fornecedor", "Valor (R$)"]
    csv = df_export.to_csv(index=False, sep=";", decimal=",").encode("utf-8-sig")

    nome_arquivo = f"Gastos_{obra_sel.split(' —')[0].replace(' ','_')}.csv"
    st.download_button(
        label="⬇️ Exportar para CSV (abrir no Excel)",
        data=csv,
        file_name=nome_arquivo,
        mime="text/csv",
        use_container_width=True,
        type="primary",
    )
    st.caption("Dica: no Excel, use Dados → De Texto/CSV e selecione separador ponto-e-vírgula.")

st.markdown("---")
st.caption("P3 Energy • Os dados ficam salvos na sessão. Conecte ao Supabase para persistência permanente.")
