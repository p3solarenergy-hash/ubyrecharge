import os
import sys

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.manager_auth import render_manager_login

st.set_page_config(page_title="Análise | UBY RECHARGE", page_icon="🔬", layout="wide")
st.title("🔬 Análise e Sensibilidade")
st.caption("Simulações financeiras e análises avançadas ficam restritas à Área do Gestor.")

if not render_manager_login("Análise financeira"):
    st.info("Depois de liberar o acesso, esta página pode receber break-even, simuladores e análises estratégicas.")
    st.stop()

st.success("Acesso liberado.")
st.markdown(
    """
Esta página foi reservada para as análises financeiras sensíveis.

Próximos passos possíveis:
- break-even detalhado
- simulador de cenários estratégicos
- análise de sensibilidade com retorno e payback
- comparações de implantação entre projetos
"""
)
