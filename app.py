import streamlit as st

from utils.home_page import render_home


navigation = st.navigation(
    {
        "Geral": [
            st.Page(render_home, title="Home", icon="🏠", default=True),
            st.Page("pages/1_Dashboard.py", title="Dashboard", icon="📊"),
            st.Page("pages/2_Projetos.py", title="Projetos", icon="📁"),
            st.Page("pages/3_Comparacao.py", title="Comparacao", icon="🔄"),
            st.Page("pages/4_Analise.py", title="Analise", icon="🔬"),
            st.Page("pages/5_Integracoes.py", title="Integracoes", icon="🔌"),
            st.Page("pages/6_Area_Gestor.py", title="Area Gestor", icon="🔒"),
        ]
    }
)

navigation.run()
