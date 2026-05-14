import streamlit as st

st.set_page_config(
    page_title="P3 Energy — Gestão",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

from utils.home_page import render_home
from utils.ui_settings import load_ui_settings

ui_settings = load_ui_settings()
nav = ui_settings["navigation"]

navigation = st.navigation(
    {
        nav["section_home"]: [
            st.Page(render_home, title=nav["home"], icon="🏠", default=True),
        ],
        nav["section_implantation"]: [
            st.Page("views/1_Implantacao_Resumo.py",       title=nav["implantation_summary"],    icon="📍"),
            st.Page("views/Controle_Obra.py",              title=nav["implantation_control"],    icon="📋"),
            st.Page("views/Gastos_Obra.py",                title=nav["implantation_expenses"],   icon="💰"),
            st.Page("views/4_Implantacao_Comparacao.py",   title=nav["implantation_comparison"], icon="📊"),
            st.Page("views/Analisador.py",                 title=nav["implantation_analyzer"],   icon="⚡"),
        ],
        nav["section_management"]: [
            st.Page("views/Agenda.py",               title=nav["agenda"],                  icon="📅"),
            st.Page("views/7_Gestao_Faturamento.py", title=nav["management_billing"],      icon="💸"),
            st.Page("views/Taxa_Ocupacao.py",        title=nav["management_occupancy"],    icon="🔌"),
            st.Page("views/Metricas.py",             title=nav["management_metrics"],      icon="📈"),
            st.Page("views/Prospeccao.py",           title=nav["management_prospection"],  icon="🔍"),
            st.Page("views/Move_Operacao.py",        title="movE Operacao",                icon="🚗"),
        ],
        nav["section_admin"]: [
            st.Page("views/5_Integracoes.py",      title=nav["integrations"],     icon="🔌"),
            st.Page("views/Instagram_Agent.py",    title=nav["instagram_agent"],  icon="📱"),
            st.Page("views/7_Configuracoes.py",    title=nav["ui_settings"],      icon="⚙️"),
        ],
    }
)

navigation.run()
