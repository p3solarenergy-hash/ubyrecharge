import os
import sys

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.manager_auth import render_manager_login
from utils.ui_settings import load_ui_settings, reset_ui_settings, save_ui_settings

st.set_page_config(page_title="Configurações | UBY RECHARGE", page_icon="⚙️", layout="wide")
st.title("⚙️ Configurações de Interface")
st.caption("Edite nomes do menu e textos principais sem mexer direto no código.")

if not render_manager_login("Configurações"):
    st.stop()

settings = load_ui_settings()

with st.form("ui_settings_form"):
    st.markdown("### Marca e cabeçalho")
    brand_col1, brand_col2 = st.columns(2)
    app_title = brand_col1.text_input("Título principal do app", value=settings["brand"]["app_title"])
    app_caption = brand_col2.text_input("Subtítulo do app", value=settings["brand"]["app_caption"])

    st.markdown("### Menu lateral")
    nav = settings["navigation"]
    nav_col1, nav_col2 = st.columns(2)
    section_general = nav_col1.text_input("Nome da seção do menu", value=nav["section_general"])
    home = nav_col2.text_input("Item Home", value=nav["home"])
    dashboard = nav_col1.text_input("Item Dashboard", value=nav["dashboard"])
    projects = nav_col2.text_input("Item Projetos", value=nav["projects"])
    comparison = nav_col1.text_input("Item Comparação", value=nav["comparison"])
    analysis = nav_col2.text_input("Item Análise", value=nav["analysis"])
    integrations = nav_col1.text_input("Item Integrações", value=nav["integrations"])
    manager_area = nav_col2.text_input("Item Área do Gestor", value=nav["manager_area"])
    ui_settings_label = nav_col1.text_input("Item Configurações", value=nav["ui_settings"])

    st.markdown("### Cards da Home")
    cards = settings["home_cards"]
    card_col1, card_col2 = st.columns(2)
    home_title = card_col1.text_input("Card Home - título", value=cards["home_title"])
    home_subtitle = card_col2.text_input("Card Home - subtítulo", value=cards["home_subtitle"])
    dashboard_title = card_col1.text_input("Card Dashboard - título", value=cards["dashboard_title"])
    dashboard_subtitle = card_col2.text_input("Card Dashboard - subtítulo", value=cards["dashboard_subtitle"])
    projects_title = card_col1.text_input("Card Projetos - título", value=cards["projects_title"])
    projects_subtitle = card_col2.text_input("Card Projetos - subtítulo", value=cards["projects_subtitle"])
    comparison_title = card_col1.text_input("Card Comparação - título", value=cards["comparison_title"])
    comparison_subtitle = card_col2.text_input("Card Comparação - subtítulo", value=cards["comparison_subtitle"])
    manager_title = card_col1.text_input("Card Área do Gestor - título", value=cards["manager_title"])
    manager_subtitle = card_col2.text_input("Card Área do Gestor - subtítulo", value=cards["manager_subtitle"])
    integrations_title = card_col1.text_input("Card Integrações - título", value=cards["integrations_title"])
    integrations_subtitle = card_col2.text_input("Card Integrações - subtítulo", value=cards["integrations_subtitle"])

    submitted = st.form_submit_button("Salvar configurações", type="primary")

if submitted:
    save_ui_settings(
        {
            "brand": {
                "app_title": app_title.strip() or settings["brand"]["app_title"],
                "app_caption": app_caption.strip() or settings["brand"]["app_caption"],
            },
            "navigation": {
                "section_general": section_general.strip() or nav["section_general"],
                "home": home.strip() or nav["home"],
                "dashboard": dashboard.strip() or nav["dashboard"],
                "projects": projects.strip() or nav["projects"],
                "comparison": comparison.strip() or nav["comparison"],
                "analysis": analysis.strip() or nav["analysis"],
                "integrations": integrations.strip() or nav["integrations"],
                "manager_area": manager_area.strip() or nav["manager_area"],
                "ui_settings": ui_settings_label.strip() or nav["ui_settings"],
            },
            "home_cards": {
                "home_title": home_title.strip() or cards["home_title"],
                "home_subtitle": home_subtitle.strip() or cards["home_subtitle"],
                "dashboard_title": dashboard_title.strip() or cards["dashboard_title"],
                "dashboard_subtitle": dashboard_subtitle.strip() or cards["dashboard_subtitle"],
                "projects_title": projects_title.strip() or cards["projects_title"],
                "projects_subtitle": projects_subtitle.strip() or cards["projects_subtitle"],
                "comparison_title": comparison_title.strip() or cards["comparison_title"],
                "comparison_subtitle": comparison_subtitle.strip() or cards["comparison_subtitle"],
                "manager_title": manager_title.strip() or cards["manager_title"],
                "manager_subtitle": manager_subtitle.strip() or cards["manager_subtitle"],
                "integrations_title": integrations_title.strip() or cards["integrations_title"],
                "integrations_subtitle": integrations_subtitle.strip() or cards["integrations_subtitle"],
            },
        }
    )
    st.success("Configurações salvas. Recarregue o app para ver o menu e a Home atualizados.")

st.markdown("---")
if st.button("Restaurar padrão"):
    reset_ui_settings()
    st.success("Configuração padrão restaurada.")
    st.rerun()

st.markdown("### Prévia")
preview = load_ui_settings()
st.json(preview)
