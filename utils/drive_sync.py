"""
Google Drive sync helpers for local execution and Streamlit Cloud.

Supported auth sources, in priority order:
1. Streamlit secrets
2. Environment variables
3. Local files (credentials.json / drive_token.json)
"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path

try:
    import streamlit as st
except Exception:  # pragma: no cover - streamlit may be unavailable in tests
    st = None

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

from utils.excel_reader import EXCEL_DIR

SCOPES = ["https://www.googleapis.com/auth/drive"]
XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet"
GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
JSON_MIME_TYPE = "application/json"
LOCATIONS_FILENAME = "locations.json"

APP_DIR = Path(__file__).resolve().parent.parent
CFG_FILE = APP_DIR / "drive_config.json"
TOKEN_FILE = APP_DIR / "drive_token.json"
CREDS_FILE = APP_DIR / "credentials.json"

DEFAULT_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"
DEFAULT_CERTS_URI = "https://www.googleapis.com/oauth2/v1/certs"


def _get_secret_section(name: str):
    if st is None:
        return None
    try:
        return st.secrets.get(name)
    except Exception:
        return None


def _secret_or_env(section: str, secret_key: str, env_key: str, default=None):
    secret_section = _get_secret_section(section)
    if secret_section and secret_key in secret_section:
        return secret_section[secret_key]
    return os.getenv(env_key, default)


def _json_secret_or_env(section: str, env_key: str):
    secret_section = _get_secret_section(section)
    if secret_section:
        return dict(secret_section)

    raw = os.getenv(env_key)
    if not raw:
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in environment variable {env_key}.") from exc


def ensure_excel_dir() -> str:
    os.makedirs(EXCEL_DIR, exist_ok=True)
    return EXCEL_DIR


def load_config() -> dict:
    if CFG_FILE.exists():
        with CFG_FILE.open("r", encoding="utf-8") as file:
            return json.load(file)
    return {}


def save_config(data: dict):
    with CFG_FILE.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def get_folder_id() -> str:
    folder_id = _secret_or_env("google_drive", "folder_id", "GOOGLE_DRIVE_FOLDER_ID", "")
    if folder_id:
        return str(folder_id).strip()

    config = load_config()
    return str(config.get("folder_id", "")).strip()


def get_runtime_mode() -> str:
    if _get_secret_section("google_oauth") or os.getenv("GOOGLE_OAUTH_CLIENT_ID"):
        return "streamlit-cloud-ready"
    if CREDS_FILE.exists():
        return "local-file"
    return "not-configured"


def has_client_credentials() -> bool:
    return bool(_build_client_config() or CREDS_FILE.exists())


def has_refresh_token() -> bool:
    token_info = _load_token_info()
    return bool(token_info and token_info.get("refresh_token"))


def is_configured() -> bool:
    return bool(get_folder_id()) and has_client_credentials() and (has_refresh_token() or CREDS_FILE.exists())


def _build_client_config():
    inline_json = _json_secret_or_env("google_oauth_json", "GOOGLE_OAUTH_JSON")
    if inline_json:
        if "installed" in inline_json:
            return inline_json
        return {"installed": inline_json}

    client_id = _secret_or_env("google_oauth", "client_id", "GOOGLE_OAUTH_CLIENT_ID")
    client_secret = _secret_or_env("google_oauth", "client_secret", "GOOGLE_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    project_id = _secret_or_env("google_oauth", "project_id", "GOOGLE_OAUTH_PROJECT_ID")
    auth_uri = _secret_or_env("google_oauth", "auth_uri", "GOOGLE_OAUTH_AUTH_URI", DEFAULT_AUTH_URI)
    token_uri = _secret_or_env("google_oauth", "token_uri", "GOOGLE_OAUTH_TOKEN_URI", DEFAULT_TOKEN_URI)
    certs_uri = _secret_or_env(
        "google_oauth",
        "auth_provider_x509_cert_url",
        "GOOGLE_OAUTH_AUTH_PROVIDER_X509_CERT_URL",
        DEFAULT_CERTS_URI,
    )

    redirect_uris = None
    secret_section = _get_secret_section("google_oauth")
    if secret_section and "redirect_uris" in secret_section:
        redirect_uris = list(secret_section["redirect_uris"])
    elif os.getenv("GOOGLE_OAUTH_REDIRECT_URIS"):
        redirect_uris = [
            item.strip()
            for item in os.getenv("GOOGLE_OAUTH_REDIRECT_URIS", "").split(",")
            if item.strip()
        ]

    return {
        "installed": {
            "client_id": client_id,
            "project_id": project_id,
            "auth_uri": auth_uri,
            "token_uri": token_uri,
            "auth_provider_x509_cert_url": certs_uri,
            "client_secret": client_secret,
            "redirect_uris": redirect_uris or ["http://localhost"],
        }
    }


def _load_token_info():
    inline_json = _json_secret_or_env("google_token_json", "GOOGLE_TOKEN_JSON")
    if inline_json:
        return inline_json

    refresh_token = _secret_or_env("google_token", "refresh_token", "GOOGLE_REFRESH_TOKEN")
    if refresh_token:
        token_uri = _secret_or_env("google_token", "token_uri", "GOOGLE_TOKEN_URI", DEFAULT_TOKEN_URI)
        client_id = _secret_or_env("google_oauth", "client_id", "GOOGLE_OAUTH_CLIENT_ID")
        client_secret = _secret_or_env("google_oauth", "client_secret", "GOOGLE_OAUTH_CLIENT_SECRET")
        scopes = _secret_or_env("google_token", "scopes", "GOOGLE_SCOPES", SCOPES)

        if isinstance(scopes, str):
            scopes = [scope.strip() for scope in scopes.split(",") if scope.strip()]

        return {
            "refresh_token": refresh_token,
            "token_uri": token_uri,
            "client_id": client_id,
            "client_secret": client_secret,
            "scopes": scopes or SCOPES,
        }

    if TOKEN_FILE.exists():
        with TOKEN_FILE.open("r", encoding="utf-8") as file:
            return json.load(file)

    return None


def _persist_token(creds: Credentials):
    if _get_secret_section("google_token") or _get_secret_section("google_token_json"):
        return
    if os.getenv("GOOGLE_REFRESH_TOKEN") or os.getenv("GOOGLE_TOKEN_JSON"):
        return

    with TOKEN_FILE.open("w", encoding="utf-8") as file:
        file.write(creds.to_json())


def get_credentials() -> Credentials:
    """Return valid Drive credentials for local or cloud execution."""
    creds = None
    token_info = _load_token_info()

    if token_info:
        creds = Credentials.from_authorized_user_info(token_info, token_info.get("scopes", SCOPES))

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _persist_token(creds)
        return creds

    client_config = _build_client_config()
    if client_config:
        flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
        creds = flow.run_local_server(port=0)
        _persist_token(creds)
        return creds

    if CREDS_FILE.exists():
        flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
        creds = flow.run_local_server(port=0)
        _persist_token(creds)
        return creds

    raise RuntimeError(
        "Google Drive is not fully configured. For Streamlit Cloud, add OAuth client data, "
        "a refresh token, and the Drive folder ID to Streamlit secrets."
    )


def build_drive_service():
    return build("drive", "v3", credentials=get_credentials())


def has_drive_write_access() -> bool:
    creds = get_credentials()
    scopes = set(creds.scopes or [])
    return "https://www.googleapis.com/auth/drive" in scopes


def require_drive_write_access():
    if has_drive_write_access():
        return

    raise RuntimeError(
        "A conta Google atual está com acesso somente leitura. Para salvar localizações no Drive, "
        "gere um novo refresh token com o escopo https://www.googleapis.com/auth/drive e atualize os secrets."
    )


def list_drive_files(folder_id: str | None = None) -> list[dict]:
    """List .xlsx files and native Google Sheets from the configured folder tree."""
    effective_folder_id = (folder_id or get_folder_id()).strip()
    if not effective_folder_id:
        raise RuntimeError("Google Drive folder ID is not configured.")

    service = build_drive_service()

    return _list_drive_files_recursive(service, effective_folder_id)


def _list_drive_files_recursive(service, folder_id: str, current_path: str = "") -> list[dict]:
    page_token = None
    files = []

    while True:
        query = f"'{folder_id}' in parents and trashed=false"
        response = (
            service.files()
            .list(
                q=query,
                fields="nextPageToken, files(id, name, mimeType, modifiedTime, size)",
                orderBy="folder,name",
                pageToken=page_token,
            )
            .execute()
        )

        for item in response.get("files", []):
            mime_type = item.get("mimeType")
            name = item.get("name", "").strip()

            if mime_type == GOOGLE_DRIVE_FOLDER_MIME_TYPE:
                next_path = os.path.join(current_path, name) if current_path else name
                files.extend(_list_drive_files_recursive(service, item["id"], next_path))
                continue

            if mime_type not in {XLSX_MIME_TYPE, GOOGLE_SHEETS_MIME_TYPE}:
                continue

            local_name = name
            if mime_type == GOOGLE_SHEETS_MIME_TYPE and not local_name.lower().endswith(".xlsx"):
                local_name = f"{local_name}.xlsx"

            relative_path = os.path.join(current_path, local_name) if current_path else local_name
            files.append(
                {
                    "id": item["id"],
                    "name": local_name,
                    "source_name": name,
                    "mimeType": mime_type,
                    "modifiedTime": item.get("modifiedTime", ""),
                    "size": item.get("size", 0),
                    "relative_path": relative_path,
                    "folder_path": current_path,
                }
            )

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    return files


def download_file(file_id: str, dest_path: str, mime_type: str = XLSX_MIME_TYPE):
    service = build_drive_service()

    if mime_type == GOOGLE_SHEETS_MIME_TYPE:
        request = service.files().export_media(fileId=file_id, mimeType=XLSX_MIME_TYPE)
    else:
        request = service.files().get_media(fileId=file_id)

    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)

    done = False
    while not done:
        _, done = downloader.next_chunk()

    with open(dest_path, "wb") as file:
        file.write(buffer.getvalue())


def find_file_in_folder(file_name: str, folder_id: str | None = None):
    effective_folder_id = (folder_id or get_folder_id()).strip()
    if not effective_folder_id:
        raise RuntimeError("Google Drive folder ID is not configured.")

    service = build_drive_service()
    safe_name = file_name.replace("'", "\\'")
    query = f"name='{safe_name}' and '{effective_folder_id}' in parents and trashed=false"
    response = (
        service.files()
        .list(q=query, fields="files(id, name, mimeType, modifiedTime, size)", pageSize=10)
        .execute()
    )
    files = response.get("files", [])
    return files[0] if files else None


def load_json_file_from_drive(file_name: str, folder_id: str | None = None):
    file_meta = find_file_in_folder(file_name, folder_id)
    if not file_meta:
        return None

    service = build_drive_service()
    request = service.files().get_media(fileId=file_meta["id"])
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    buffer.seek(0)
    return json.loads(buffer.read().decode("utf-8"))


def save_json_file_to_drive(file_name: str, data: dict, folder_id: str | None = None):
    require_drive_write_access()

    effective_folder_id = (folder_id or get_folder_id()).strip()
    if not effective_folder_id:
        raise RuntimeError("Google Drive folder ID is not configured.")

    service = build_drive_service()
    body_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    media = MediaIoBaseUpload(io.BytesIO(body_bytes), mimetype=JSON_MIME_TYPE, resumable=False)

    existing = find_file_in_folder(file_name, effective_folder_id)
    if existing:
        service.files().update(fileId=existing["id"], media_body=media).execute()
    else:
        service.files().create(
            body={"name": file_name, "parents": [effective_folder_id], "mimeType": JSON_MIME_TYPE},
            media_body=media,
            fields="id",
        ).execute()


def load_locations_from_drive(folder_id: str | None = None) -> dict | None:
    return load_json_file_from_drive(LOCATIONS_FILENAME, folder_id)


def save_locations_to_drive(data: dict, folder_id: str | None = None):
    save_json_file_to_drive(LOCATIONS_FILENAME, data, folder_id)


def sync_all(folder_id: str | None = None, dest_dir: str | None = None) -> tuple[list[str], list[str]]:
    """
    Sync all .xlsx files from the Drive folder into the local data directory.
    Returns (downloaded_files, errors).
    """
    effective_folder_id = (folder_id or get_folder_id()).strip()
    if not effective_folder_id:
        raise RuntimeError("Google Drive folder ID is not configured.")

    target_dir = dest_dir or ensure_excel_dir()
    os.makedirs(target_dir, exist_ok=True)

    files = list_drive_files(effective_folder_id)
    downloaded = []
    errors = []
    remote_names = set()

    for item in files:
        name = item["name"]
        relative_path = item["relative_path"]
        if name.startswith("~$") or not name.lower().endswith(".xlsx"):
            continue

        remote_names.add(relative_path)
        try:
            dest_path = os.path.join(target_dir, relative_path)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            download_file(item["id"], dest_path, item.get("mimeType", XLSX_MIME_TYPE))
            downloaded.append(relative_path)
        except Exception as exc:
            errors.append(f"{relative_path}: {exc}")

    for root, _, filenames in os.walk(target_dir, topdown=False):
        for local_name in filenames:
            if not local_name.lower().endswith(".xlsx"):
                continue

            local_path = os.path.join(root, local_name)
            relative_local_path = os.path.relpath(local_path, target_dir)
            if relative_local_path not in remote_names:
                os.remove(local_path)

        if root != target_dir and not os.listdir(root):
            os.rmdir(root)

    return downloaded, errors
