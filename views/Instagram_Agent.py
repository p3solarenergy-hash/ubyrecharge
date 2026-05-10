"""
Agente Instagram — Gerador automático de conteúdo EV
para @p3energy e @ubyrecharge Business accounts
"""
import os
import sys
import json
import datetime
import requests

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.p3_styles import inject, page_header, section_title

inject()

page_header(
    "📱 Agente Instagram",
    "Gere e publique conteúdo automático de dicas EV para @p3energy e @ubyrecharge.",
)

# ── PERFIS ────────────────────────────────────────────────────────────────────
PROFILES = {
    "@p3energy": {
        "label": "@p3energy",
        "handle": "p3energy",
        "description": "P3 Energy — Soluções em energia solar e mobilidade elétrica",
        "token_key": "instagram_token_p3energy",
        "account_id_key": "instagram_id_p3energy",
        "color": "#3FB66B",
    },
    "@ubyrecharge": {
        "label": "@ubyrecharge",
        "handle": "ubyrecharge",
        "description": "UBY Recharge — Rede de recarga inteligente para veículos elétricos",
        "token_key": "instagram_token_ubyrecharge",
        "account_id_key": "instagram_id_ubyrecharge",
        "color": "#FFD66B",
    },
}

# ── TÓPICOS EV ────────────────────────────────────────────────────────────────
TOPICS = [
    "Benefícios dos veículos elétricos",
    "Como funciona a recarga de EVs",
    "Recarga em casa vs. recarga pública",
    "Autonomia e eficiência dos EVs",
    "Economia com veículos elétricos",
    "Impacto ambiental e sustentabilidade",
    "Manutenção de EVs (comparação com combustão)",
    "Segurança em veículos elétricos",
    "Infraestrutura de recarga no Brasil",
    "Incentivos fiscais para EVs no Brasil",
    "Modelos de EVs disponíveis no Brasil",
    "Tecnologia de baterias e evolução",
    "EV para empresas e frotas comerciais",
    "Mobilidade elétrica nas cidades",
    "Mitos e verdades sobre carros elétricos",
]

# Calendário editorial sugerido (segunda → domingo)
SUGGESTED_EDITORIAL = [
    ("@ubyrecharge", "Como funciona a recarga de EVs"),
    ("@p3energy",    "Economia com veículos elétricos"),
    ("@ubyrecharge", "Recarga em casa vs. recarga pública"),
    ("@p3energy",    "Impacto ambiental e sustentabilidade"),
    ("@ubyrecharge", "Infraestrutura de recarga no Brasil"),
    ("@p3energy",    "Modelos de EVs disponíveis no Brasil"),
    ("Ambos",        "Mobilidade elétrica nas cidades"),
]


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _get_secret(key: str) -> str:
    """Lê segredo do Streamlit secrets ou variável de ambiente."""
    try:
        if hasattr(st, "secrets"):
            if key in st.secrets:
                return str(st.secrets[key])
            insta = st.secrets.get("instagram", {})
            if key in insta:
                return str(insta[key])
    except Exception:
        pass
    return os.environ.get(key, "")


def generate_content_anthropic(topic: str, profile: dict, tone: str = "misto") -> dict:
    """Gera legenda e hashtags usando Claude Haiku via API da Anthropic."""
    try:
        import anthropic
    except ImportError:
        return {"error": "Pacote 'anthropic' não instalado. Rode: pip install anthropic"}

    api_key = _get_secret("ANTHROPIC_API_KEY")
    if not api_key:
        return {"error": "ANTHROPIC_API_KEY não configurada nos secrets do Streamlit Cloud."}

    tone_desc = {
        "profissional": "formal, técnico e informativo — use dados e argumentos sólidos",
        "acessível":    "leve, descontraído e próximo do público geral — evite jargões",
        "misto":        "equilibrado: profissional mas acessível, com dados mas sem excesso de termos técnicos",
    }.get(tone, "equilibrado")

    prompt = f"""Você é um redator especialista em mobilidade elétrica e energia limpa.
Crie uma legenda de Instagram para o perfil {profile['label']} ({profile['description']}).

Tópico: {topic}
Tom: {tone_desc}

Responda APENAS com um JSON válido, sem markdown, sem texto fora do JSON:
{{
  "caption": "texto da legenda (2-4 parágrafos, máx 2.200 caracteres, use 3-6 emojis relevantes, termine com chamada para ação)",
  "hashtags": "#hashtag1 #hashtag2 ... (20 a 25 hashtags em português e inglês)"
}}

Regras:
- Escreva em português brasileiro
- Inclua 1-2 dados ou fatos reais e interessantes sobre o tópico
- Adapte à identidade do perfil sem mencionar o @ no texto
- Hashtags: misture populares (#carroeletrico) com de nicho (#mobilidadeeletrica #EVBrasil)
"""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        return json.loads(raw)
    except json.JSONDecodeError:
        # fallback: return raw text as caption
        return {"caption": raw, "hashtags": ""}
    except Exception as exc:
        return {"error": str(exc)}


def post_to_instagram(access_token: str, ig_account_id: str, image_url: str, caption: str) -> dict:
    """
    Publica imagem no Instagram via Graph API (v19.0).
    Passo 1 → cria container de mídia.
    Passo 2 → publica o container.
    """
    base = "https://graph.facebook.com/v19.0"

    # Step 1: criar container
    r1 = requests.post(
        f"{base}/{ig_account_id}/media",
        data={"image_url": image_url, "caption": caption, "access_token": access_token},
        timeout=30,
    )
    res1 = r1.json()
    if "error" in res1:
        return {"ok": False, "error": res1["error"].get("message", str(res1["error"]))}

    creation_id = res1.get("id")
    if not creation_id:
        return {"ok": False, "error": "ID de criação não retornado pela API."}

    # Step 2: publicar
    r2 = requests.post(
        f"{base}/{ig_account_id}/media_publish",
        data={"creation_id": creation_id, "access_token": access_token},
        timeout=30,
    )
    res2 = r2.json()
    if "error" in res2:
        return {"ok": False, "error": res2["error"].get("message", str(res2["error"]))}

    return {"ok": True, "post_id": res2.get("id"), "creation_id": creation_id}


# ── TABS ──────────────────────────────────────────────────────────────────────
tab_gen, tab_queue, tab_cfg = st.tabs(["✍️ Gerador", "📅 Calendário", "⚙️ Configurações API"])


# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — GERADOR DE CONTEÚDO
# ══════════════════════════════════════════════════════════════════════════════
with tab_gen:
    section_title("Gerar Conteúdo com IA")

    gc1, gc2, gc3 = st.columns([2, 2, 1])
    with gc1:
        profile_options = ["Ambos os perfis"] + list(PROFILES.keys())
        selected_profile_label = st.selectbox("Perfil", options=profile_options, index=0)
    with gc2:
        topic = st.selectbox("Tópico", options=TOPICS, index=0)
    with gc3:
        tone = st.selectbox("Tom", options=["misto", "profissional", "acessível"], index=0)

    col_gen, col_regen = st.columns([3, 1])
    with col_gen:
        generate_btn = st.button("🤖 Gerar conteúdo com IA", type="primary", use_container_width=True)
    with col_regen:
        regen_btn = st.button("🔄 Regerar", use_container_width=True)

    # Determine which profiles to generate for
    if generate_btn or regen_btn:
        if selected_profile_label == "Ambos os perfis":
            profiles_to_gen = list(PROFILES.values())
        else:
            profiles_to_gen = [PROFILES[selected_profile_label]]

        for prof in profiles_to_gen:
            with st.spinner(f"Gerando conteúdo para {prof['label']}..."):
                result = generate_content_anthropic(topic, prof, tone)
            st.session_state[f"gen_{prof['handle']}"] = result
            st.session_state[f"gen_topic_{prof['handle']}"] = topic

    # ── Preview cards ────────────────────────────────────────────────────────
    for prof in PROFILES.values():
        key = f"gen_{prof['handle']}"
        if key not in st.session_state:
            continue

        result = st.session_state[key]
        st.markdown("")

        with st.container(border=True):
            # Cabeçalho do perfil
            st.markdown(
                f"<div style='display:flex;align-items:center;gap:12px;margin-bottom:14px'>"
                f"<div style='width:40px;height:40px;border-radius:50%;background:{prof['color']};"
                f"display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0'>📸</div>"
                f"<div>"
                f"<div style='font-weight:700;font-size:15px;color:#E8EFEB'>{prof['label']}</div>"
                f"<div style='font-size:11px;color:#8FA39A'>{prof['description']}</div>"
                f"</div></div>",
                unsafe_allow_html=True,
            )

            if "error" in result:
                st.error(result["error"])
                if "ANTHROPIC_API_KEY" in result.get("error", ""):
                    st.info("Configure a ANTHROPIC_API_KEY nos Secrets do Streamlit Cloud (aba Configurações API).", icon="🔑")
            else:
                # Campos editáveis
                edited_caption = st.text_area(
                    "📝 Legenda",
                    value=result.get("caption", ""),
                    height=200,
                    key=f"caption_{prof['handle']}",
                    help="Edite livremente antes de publicar.",
                )
                edited_hashtags = st.text_area(
                    "#️⃣ Hashtags",
                    value=result.get("hashtags", ""),
                    height=70,
                    key=f"hashtags_{prof['handle']}",
                )

                full_caption = f"{edited_caption}\n\n{edited_hashtags}".strip()
                char_count = len(full_caption)
                char_color = "#3FB66B" if char_count <= 2200 else "#E55545"

                cnt_col, copy_col = st.columns([3, 1])
                with cnt_col:
                    st.markdown(
                        f"<span style='font-size:12px;color:{char_color}'>"
                        f"{char_count:,} / 2.200 caracteres</span>",
                        unsafe_allow_html=True,
                    )
                with copy_col:
                    if st.button("📋 Copiar", key=f"copy_{prof['handle']}", use_container_width=True):
                        st.code(full_caption, language=None)

                # ── Publicação ──────────────────────────────────────────────
                st.markdown("---")
                img_col, btn_col = st.columns([3, 1])
                with img_col:
                    image_url = st.text_input(
                        "🖼️ URL da imagem (pública, HTTPS)",
                        placeholder="https://exemplo.com/imagem.jpg",
                        key=f"img_{prof['handle']}",
                        help="A imagem deve ser acessível publicamente. Formatos: JPG, PNG. Mín. 320px.",
                    )
                with btn_col:
                    st.markdown("<div style='height:28px'></div>", unsafe_allow_html=True)
                    post_btn = st.button(
                        "📤 Publicar",
                        type="primary",
                        use_container_width=True,
                        key=f"post_{prof['handle']}",
                    )

                if post_btn:
                    if not image_url.strip():
                        st.warning("Insira uma URL de imagem pública (HTTPS) para publicar.", icon="⚠️")
                    elif char_count > 2200:
                        st.error("A legenda ultrapassa 2.200 caracteres. Reduza o texto antes de publicar.")
                    else:
                        token = _get_secret(prof["token_key"])
                        account_id = _get_secret(prof["account_id_key"])
                        if not token or not account_id:
                            st.error(
                                f"Configure `{prof['token_key']}` e `{prof['account_id_key']}` "
                                "nos Secrets do Streamlit Cloud (aba ⚙️ Configurações API)."
                            )
                        else:
                            with st.spinner(f"Publicando em {prof['label']}..."):
                                res = post_to_instagram(token, account_id, image_url.strip(), full_caption)
                            if res["ok"]:
                                st.success(f"✅ Publicado! Post ID: `{res['post_id']}`")
                                entry = {
                                    "profile": prof["label"],
                                    "topic": st.session_state.get(f"gen_topic_{prof['handle']}", topic),
                                    "caption_preview": edited_caption[:90] + ("..." if len(edited_caption) > 90 else ""),
                                    "published_at": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
                                    "post_id": res["post_id"],
                                    "color": prof["color"],
                                }
                                history = st.session_state.get("post_history", [])
                                history.insert(0, entry)
                                st.session_state["post_history"] = history
                            else:
                                st.error(f"Erro ao publicar: {res['error']}")

    if not any(f"gen_{p['handle']}" in st.session_state for p in PROFILES.values()):
        st.markdown("")
        st.info(
            "Selecione o perfil e o tópico, depois clique em **🤖 Gerar conteúdo com IA** para criar sua legenda.",
            icon="💡",
        )


# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — CALENDÁRIO EDITORIAL E HISTÓRICO
# ══════════════════════════════════════════════════════════════════════════════
with tab_queue:
    # ── Histórico de posts publicados ────────────────────────────────────────
    section_title("Histórico desta Sessão")

    history = st.session_state.get("post_history", [])
    if not history:
        st.info("Nenhum post publicado nesta sessão. Após publicar, o histórico aparecerá aqui.", icon="📭")
    else:
        for entry in history:
            with st.container(border=True):
                hc1, hc2, hc3 = st.columns([1, 4, 1])
                with hc1:
                    st.markdown(
                        f"<div style='color:{entry['color']};font-weight:700;font-size:13px'>{entry['profile']}</div>"
                        f"<div style='font-size:11px;color:#8FA39A;margin-top:2px'>{entry['published_at']}</div>",
                        unsafe_allow_html=True,
                    )
                with hc2:
                    st.markdown(
                        f"<div style='font-size:13px;color:#E8EFEB'>{entry['caption_preview']}</div>"
                        f"<div style='font-size:11px;color:#8FA39A;margin-top:4px'>Tópico: {entry['topic']}</div>",
                        unsafe_allow_html=True,
                    )
                with hc3:
                    st.markdown(
                        "<span style='background:#1A3028;padding:3px 10px;border-radius:12px;"
                        "font-size:11px;color:#3FB66B;font-weight:600'>✅ Publicado</span>",
                        unsafe_allow_html=True,
                    )

    st.markdown("")

    # ── Calendário editorial da semana ───────────────────────────────────────
    section_title("Calendário Editorial — Semana Atual")
    st.caption("Sugestão de conteúdo para os 7 dias da semana.")

    today_weekday = datetime.date.today().weekday()  # 0 = segunda
    days_pt = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

    # Calcula as datas da semana atual
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today_weekday)

    cal_cols = st.columns(7)
    for i, (col, day_abbr) in enumerate(zip(cal_cols, days_pt)):
        day_date = monday + datetime.timedelta(days=i)
        is_today = i == today_weekday
        is_past = i < today_weekday
        prof_sug, topic_sug = SUGGESTED_EDITORIAL[i]
        color = "#3FB66B" if "p3energy" in prof_sug else "#FFD66B" if "uby" in prof_sug else "#7FCCFF"
        text_color = "#E8EFEB" if is_today else ("#5A7066" if is_past else "#B0C4BB")
        border_style = f"2px solid {color}" if is_today else "1px solid #2A3530"

        with col:
            with st.container(border=True):
                st.markdown(
                    f"<div style='text-align:center;padding:4px 0'>"
                    f"<div style='font-size:9px;color:#8FA39A;text-transform:uppercase;letter-spacing:1px'>{day_abbr}</div>"
                    f"<div style='font-size:15px;font-weight:{'800' if is_today else '600'};"
                    f"color:{('#3FB66B' if is_today else text_color)};margin:2px 0'>"
                    f"{day_date.day:02d}</div>"
                    f"<div style='font-size:10px;color:{color};font-weight:600;margin-bottom:4px'>{prof_sug}</div>"
                    f"<div style='font-size:9px;color:#8FA39A;line-height:1.3'>"
                    f"{topic_sug[:24]}{'…' if len(topic_sug) > 24 else ''}</div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )

    st.markdown("")
    st.caption(
        "💡 Dica: para gerar o conteúdo de cada dia, volte à aba **✍️ Gerador** e selecione o tópico sugerido."
    )


# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — CONFIGURAÇÕES API
# ══════════════════════════════════════════════════════════════════════════════
with tab_cfg:
    section_title("Configurações da API")

    st.info(
        "A publicação usa a **Instagram Graph API** (conta Business conectada a uma Página do Facebook). "
        "A geração de conteúdo usa o **Claude Haiku** via API da Anthropic.",
        icon="ℹ️",
    )

    # ── Status das credenciais ───────────────────────────────────────────────
    section_title("Status das Credenciais")

    cred_checks = [
        ("ANTHROPIC_API_KEY",           "Anthropic — geração IA",     "#7FCCFF"),
        ("instagram_token_p3energy",    "@p3energy — Access Token",   "#3FB66B"),
        ("instagram_id_p3energy",       "@p3energy — Account ID",     "#3FB66B"),
        ("instagram_token_ubyrecharge", "@ubyrecharge — Access Token","#FFD66B"),
        ("instagram_id_ubyrecharge",    "@ubyrecharge — Account ID",  "#FFD66B"),
    ]

    cols5 = st.columns(5)
    for (ckey, clabel, ccolor), col in zip(cred_checks, cols5):
        val = _get_secret(ckey)
        ok = bool(val)
        with col:
            with st.container(border=True):
                st.markdown(
                    f"<div style='font-size:9px;color:{ccolor};text-transform:uppercase;"
                    f"letter-spacing:1px;margin-bottom:6px'>{clabel}</div>"
                    f"<div style='font-size:24px'>{'✅' if ok else '❌'}</div>"
                    f"<div style='font-size:12px;color:{'#3FB66B' if ok else '#E55545'}'>"
                    f"{'OK' if ok else 'Faltando'}</div>",
                    unsafe_allow_html=True,
                )

    st.markdown("")
    if st.button("🔍 Testar conexão com Instagram API", use_container_width=True):
        tested_any = False
        for prof in PROFILES.values():
            token = _get_secret(prof["token_key"])
            account_id = _get_secret(prof["account_id_key"])
            if token and account_id:
                tested_any = True
                try:
                    r = requests.get(
                        f"https://graph.facebook.com/v19.0/{account_id}",
                        params={
                            "fields": "name,username,followers_count,media_count",
                            "access_token": token,
                        },
                        timeout=10,
                    )
                    data = r.json()
                    if "error" in data:
                        st.error(f"{prof['label']}: {data['error'].get('message', str(data['error']))}")
                    else:
                        st.success(
                            f"✅ {prof['label']} — @{data.get('username', '?')} · "
                            f"{data.get('followers_count', '?'):,} seguidores · "
                            f"{data.get('media_count', '?')} posts"
                        )
                except Exception as exc:
                    st.error(f"{prof['label']}: Erro de conexão — {exc}")
        if not tested_any:
            st.warning("Nenhuma credencial de Instagram configurada. Siga o guia abaixo.", icon="⚠️")

    st.markdown("")

    # ── Guias de configuração ────────────────────────────────────────────────
    with st.expander("🔑 Anthropic API Key (geração de conteúdo)", expanded=False):
        st.markdown("""
1. Acesse **[console.anthropic.com](https://console.anthropic.com)** → **API Keys** → **Create Key**
2. Copie a chave (começa com `sk-ant-...`)
3. No Streamlit Cloud: **App → Settings → Secrets** e adicione:

```toml
ANTHROPIC_API_KEY = "sk-ant-api03-..."
```
""")

    with st.expander("📱 Instagram Graph API — Passo a passo completo", expanded=False):
        st.markdown("""
**Pré-requisitos:**
- Conta Instagram **Business** ou **Creator**
- Conectada a uma **Página do Facebook** (obrigatório para a API)
- Acesso ao **Meta for Developers** (developers.facebook.com)

---

**1. Criar o App no Meta for Developers**
- Acesse developers.facebook.com → **Meus Apps → Criar App**
- Tipo: **Business** → adicione o produto **Instagram Graph API**

**2. Gerar o Token de Acesso de Curta Duração**
- Vá em **Graph API Explorer**
- Selecione seu App
- Em permissões, adicione: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
- Clique em **Gerar Token de Acesso**

**3. Trocar por Token de Longa Duração (60 dias)**
```
GET https://graph.facebook.com/v19.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={TOKEN_CURTA_DURACAO}
```

**4. Obter o Instagram Business Account ID**
```
# 1. Listar suas páginas do Facebook:
GET https://graph.facebook.com/v19.0/me/accounts?access_token={TOKEN}

# 2. Com o page_id retornado, buscar a conta Instagram vinculada:
GET https://graph.facebook.com/v19.0/{PAGE_ID}
  ?fields=instagram_business_account
  &access_token={TOKEN}

# O campo instagram_business_account.id é o seu Account ID
```

**5. Adicionar aos Secrets do Streamlit Cloud**

No Streamlit Cloud: **App → Settings → Secrets**:
```toml
ANTHROPIC_API_KEY = "sk-ant-..."

[instagram]
instagram_token_p3energy    = "EAA..."
instagram_id_p3energy       = "17841..."
instagram_token_ubyrecharge = "EAA..."
instagram_id_ubyrecharge    = "17841..."
```

**Nota sobre renovação de token:**
O token de longa duração expira em 60 dias. Renove antes do vencimento com:
```
GET https://graph.facebook.com/v19.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={TOKEN_ATUAL}
```
""")

    with st.expander("🖼️ Dicas sobre imagens para o Instagram", expanded=False):
        st.markdown("""
**Requisitos da API:**
- URL da imagem deve ser **pública** e acessível via HTTPS
- Formatos: **JPG** ou **PNG** (recomendado JPG para menor tamanho)
- Tamanho mínimo: **320 x 320 px**
- Tamanho máximo do arquivo: **8 MB**
- Proporção recomendada para feed: **1:1** (quadrado, ex: 1080×1080 px)

**Onde hospedar suas imagens:**
- Google Drive (com link público)
- Dropbox (link direto)
- Imgur
- Seu próprio servidor ou CDN

**Dica:** Use o Canva para criar posts no formato 1080×1080 com a identidade visual da P3 Energy,
exporte como JPG e hospede no Google Drive com permissão pública.
""")

st.markdown("---")
st.caption("P3 Energy • Agente Instagram — Conteúdo automático de mobilidade elétrica.")
