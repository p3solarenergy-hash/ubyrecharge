import os
import sys

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.manager_auth import render_manager_login
from utils.ui_settings import load_ui_settings, reset_ui_settings, save_ui_settings

st.set_page_config(page_title="Configuracoes", page_icon="⚙️", layout="wide")
st.title("⚙️ Configuracoes de Interface")
st.caption("Ajuste os blocos principais do app sem editar o codigo.")

if not render_manager_login("Configuracoes"):
    st.stop()

settings = load_ui_settings()

with st.form("ui_settings_form"):
    st.markdown("### Marca")
    brand_col1, brand_col2 = st.columns(2)
    app_title = brand_col1.text_input("Titulo principal", value=settings["brand"]["app_title"])
    app_caption = brand_col2.text_input("Subtitulo", value=settings["brand"]["app_caption"])

    st.markdown("### Navegacao")
    nav = settings["navigation"]
    nav_col1, nav_col2 = st.columns(2)
    section_home = nav_col1.text_input("Secao Home", value=nav["section_home"])
    section_implantation = nav_col2.text_input("Secao Implantacao", value=nav["section_implantation"])
    section_management = nav_col1.text_input("Secao Gestao", value=nav["section_management"])
    section_admin = nav_col2.text_input("Secao Administracao", value=nav["section_admin"])
    home = nav_col1.text_input("Pagina Home", value=nav["home"])
    implantation_summary = nav_col2.text_input("Resumo do Projeto", value=nav["implantation_summary"])
    implantation_viability = nav_col1.text_input("CAPEX e Viabilidade", value=nav["implantation_viability"])
    implantation_timeline = nav_col2.text_input("Cronograma", value=nav["implantation_timeline"])
    implantation_comparison = nav_col1.text_input("Comparacao de Implantacao", value=nav["implantation_comparison"])
    management_executive = nav_col2.text_input("Visao Executiva", value=nav["management_executive"])
    management_operations = nav_col1.text_input("Operacao", value=nav["management_operations"])
    management_billing = nav_col2.text_input("Faturamento", value=nav["management_billing"])
    management_comparison = nav_col1.text_input("Comparacao Operacional", value=nav["management_comparison"])
    management_partners = nav_col2.text_input("Parceiros", value=nav["management_partners"])
    integrations = nav_col1.text_input("Integracoes", value=nav["integrations"])
    crm_implantation = nav_col2.text_input("CRM Implantacao", value=nav["crm_implantation"])
    manager_area = nav_col1.text_input("Area do Gestor", value=nav["manager_area"])
    ui_settings_label = nav_col2.text_input("Configuracoes", value=nav["ui_settings"])

    st.markdown("### Cards da Home")
    cards = settings["home_cards"]
    card_col1, card_col2 = st.columns(2)
    home_title = card_col1.text_input("Card Mapa - titulo", value=cards["home_title"])
    home_subtitle = card_col2.text_input("Card Mapa - subtitulo", value=cards["home_subtitle"])
    implantation_title = card_col1.text_input("Card Implantacao - titulo", value=cards["implantation_title"])
    implantation_subtitle = card_col2.text_input("Card Implantacao - subtitulo", value=cards["implantation_subtitle"])
    management_title = card_col1.text_input("Card Gestao - titulo", value=cards["management_title"])
    management_subtitle = card_col2.text_input("Card Gestao - subtitulo", value=cards["management_subtitle"])
    manager_title = card_col1.text_input("Card Gestor - titulo", value=cards["manager_title"])
    manager_subtitle = card_col2.text_input("Card Gestor - subtitulo", value=cards["manager_subtitle"])
    integrations_title = card_col1.text_input("Card Integracoes - titulo", value=cards["integrations_title"])
    integrations_subtitle = card_col2.text_input("Card Integracoes - subtitulo", value=cards["integrations_subtitle"])

    submitted = st.form_submit_button("Salvar configuracoes", type="primary")

if submitted:
    save_ui_settings(
        {
            "brand": {
                "app_title": app_title.strip() or settings["brand"]["app_title"],
                "app_caption": app_caption.strip() or settings["brand"]["app_caption"],
            },
            "navigation": {
                "section_home": section_home.strip() or nav["section_home"],
                "section_implantation": section_implantation.strip() or nav["section_implantation"],
                "section_management": section_management.strip() or nav["section_management"],
                "section_admin": section_admin.strip() or nav["section_admin"],
                "home": home.strip() or nav["home"],
                "implantation_summary": implantation_summary.strip() or nav["implantation_summary"],
                "implantation_viability": implantation_viability.strip() or nav["implantation_viability"],
                "implantation_timeline": implantation_timeline.strip() or nav["implantation_timeline"],
                "implantation_comparison": implantation_comparison.strip() or nav["implantation_comparison"],
                "management_executive": management_executive.strip() or nav["management_executive"],
                "management_operations": management_operations.strip() or nav["management_operations"],
                "management_billing": management_billing.strip() or nav["management_billing"],
                "management_comparison": management_comparison.strip() or nav["management_comparison"],
                "management_partners": management_partners.strip() or nav["management_partners"],
                "integrations": integrations.strip() or nav["integrations"],
                "crm_implantation": crm_implantation.strip() or nav["crm_implantation"],
                "manager_area": manager_area.strip() or nav["manager_area"],
                "ui_settings": ui_settings_label.strip() or nav["ui_settings"],
            },
            "home_cards": {
                "home_title": home_title.strip() or cards["home_title"],
                "home_subtitle": home_subtitle.strip() or cards["home_subtitle"],
                "implantation_title": implantation_title.strip() or cards["implantation_title"],
                "implantation_subtitle": implantation_subtitle.strip() or cards["implantation_subtitle"],
                "management_title": management_title.strip() or cards["management_title"],
                "management_subtitle": management_subtitle.strip() or cards["management_subtitle"],
                "manager_title": manager_title.strip() or cards["manager_title"],
                "manager_subtitle": manager_subtitle.strip() or cards["manager_subtitle"],
                "integrations_title": integrations_title.strip() or cards["integrations_title"],
                "integrations_subtitle": integrations_subtitle.strip() or cards["integrations_subtitle"],
            },
        }
    )
    st.success("Configuracoes salvas. Recarregue o app para ver a nova navegacao.")

st.markdown("---")
if st.button("Restaurar padrao"):
    reset_ui_settings()
    st.success("Configuracao padrao restaurada.")
    st.rerun()

st.markdown("### Previa atual")
st.json(load_ui_settings())
