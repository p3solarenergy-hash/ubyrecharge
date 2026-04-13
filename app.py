import streamlit as st

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
            st.Page("pages/1_Implantacao_Resumo.py", title=nav["implantation_summary"], icon="📍"),
            st.Page("pages/2_Projetos.py", title=nav["implantation_viability"], icon="📁"),
            st.Page("pages/3_Implantacao_Cronograma.py", title=nav["implantation_timeline"], icon="🗓️"),
            st.Page("pages/4_Implantacao_Comparacao.py", title=nav["implantation_comparison"], icon="🔄"),
        ],
        nav["section_management"]: [
            st.Page("pages/5_Gestao_Executiva.py", title=nav["management_executive"], icon="📊"),
            st.Page("pages/6_Gestao_Operacao.py", title=nav["management_operations"], icon="⚙️"),
            st.Page("pages/7_Gestao_Faturamento.py", title=nav["management_billing"], icon="💸"),
            st.Page("pages/8_Gestao_Comparacao.py", title=nav["management_comparison"], icon="📈"),
            st.Page("pages/9_Gestao_Parceiros.py", title=nav["management_partners"], icon="🤝"),
        ],
        nav["section_admin"]: [
            st.Page("pages/5_Integracoes.py", title=nav["integrations"], icon="🔌"),
            st.Page("pages/10_CRM_Implantacao.py", title=nav["crm_implantation"], icon="📂"),
            st.Page("pages/6_Area_Gestor.py", title=nav["manager_area"], icon="🔒"),
            st.Page("pages/7_Configuracoes.py", title=nav["ui_settings"], icon="⚙️"),
        ],
    }
)

navigation.run()
