import streamlit as st

from utils.home_page import render_home
from utils.ui_settings import load_ui_settings

ui_settings = load_ui_settings()
nav = ui_settings["navigation"]

navigation = st.navigation(
    {
        nav["section_general"]: [
            st.Page(render_home, title=nav["home"], icon="🏠", default=True),
            st.Page("pages/1_Dashboard.py", title=nav["dashboard"], icon="📊"),
            st.Page("pages/2_Projetos.py", title=nav["projects"], icon="📁"),
            st.Page("pages/3_Comparacao.py", title=nav["comparison"], icon="🔄"),
            st.Page("pages/4_Analise.py", title=nav["analysis"], icon="🔬"),
            st.Page("pages/5_Integracoes.py", title=nav["integrations"], icon="🔌"),
            st.Page("pages/6_Area_Gestor.py", title=nav["manager_area"], icon="🔒"),
            st.Page("pages/7_Configuracoes.py", title=nav["ui_settings"], icon="⚙️"),
        ]
    }
)

navigation.run()
