from __future__ import annotations

import json
import os
import re
import uuid
from copy import deepcopy
from datetime import datetime

from utils.drive_sync import (
    ensure_drive_folder,
    get_folder_id,
    has_drive_write_access,
    load_json_file_from_drive,
    save_json_file_to_drive,
    upload_file_bytes_to_drive,
)

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CRM_FILE = os.path.join(APP_DIR, "crm_pipeline.json")
CRM_FILENAME = "crm_pipeline.json"

CRM_AREAS = ["Prospecção", "Negociação", "Documentação", "Obra"]
AREA_STATUS_OPTIONS = {
    "Prospecção": ["Novo", "Contato inicial", "Qualificado", "Aguardando retorno"],
    "Negociação": ["Em negociação", "Proposta enviada", "Aguardando decisão", "Fechado"],
    "Documentação": ["Pendente", "Em coleta", "Em análise", "Concluída"],
    "Obra": ["Planejada", "Mobilização", "Em execução", "Concluída"],
}
PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"]


def _default_data() -> dict:
    return {"items": []}


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", str(value or "").strip()).strip("-").lower()
    return slug or "registro"


def _load_local() -> dict:
    if os.path.exists(CRM_FILE):
        with open(CRM_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict):
                return data
    return _default_data()


def _save_local(data: dict):
    with open(CRM_FILE, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def load_crm_data() -> dict:
    folder_id = get_folder_id()
    if folder_id:
        try:
            data = load_json_file_from_drive(CRM_FILENAME, folder_id)
            if isinstance(data, dict):
                _save_local(data)
                return data
        except Exception:
            pass
    return _load_local()


def save_crm_data(data: dict):
    payload = deepcopy(data)
    folder_id = get_folder_id()
    if folder_id:
        try:
            save_json_file_to_drive(CRM_FILENAME, payload, folder_id)
        except Exception:
            pass
    _save_local(payload)


def list_crm_items() -> list[dict]:
    data = load_crm_data()
    items = data.get("items", [])
    return items if isinstance(items, list) else []


def get_crm_item(item_id: str) -> dict | None:
    for item in list_crm_items():
        if item.get("id") == item_id:
            return item
    return None


def upsert_crm_item(payload: dict) -> dict:
    data = load_crm_data()
    items = data.get("items", [])
    now = datetime.now().isoformat(timespec="seconds")
    item_id = payload.get("id") or str(uuid.uuid4())

    normalized = {
        "id": item_id,
        "title": str(payload.get("title", "")).strip(),
        "company": str(payload.get("company", "")).strip(),
        "project": str(payload.get("project", "")).strip(),
        "area": str(payload.get("area", "Negociação")).strip() or "Negociação",
        "status": str(payload.get("status", "Novo")).strip() or "Novo",
        "priority": str(payload.get("priority", "Média")).strip() or "Média",
        "owner": str(payload.get("owner", "")).strip(),
        "city": str(payload.get("city", "")).strip(),
        "expected_close": str(payload.get("expected_close", "")).strip(),
        "next_step": str(payload.get("next_step", "")).strip(),
        "notes": str(payload.get("notes", "")).strip(),
        "documents": payload.get("documents", []) or [],
        "created_at": payload.get("created_at") or now,
        "updated_at": now,
    }

    updated = False
    for index, item in enumerate(items):
        if item.get("id") == item_id:
            normalized["created_at"] = item.get("created_at", normalized["created_at"])
            normalized["documents"] = payload.get("documents", item.get("documents", [])) or []
            items[index] = normalized
            updated = True
            break

    if not updated:
        items.append(normalized)

    data["items"] = items
    save_crm_data(data)
    return normalized


def delete_crm_item(item_id: str):
    data = load_crm_data()
    data["items"] = [item for item in data.get("items", []) if item.get("id") != item_id]
    save_crm_data(data)


def upload_crm_document(item: dict, uploaded_file) -> dict:
    if not has_drive_write_access():
        raise RuntimeError("O app precisa de acesso de escrita no Google Drive para salvar anexos.")

    root_folder = ensure_drive_folder("CRM Gestor")
    area_folder = ensure_drive_folder(_slugify(item.get("area", "geral")).replace("-", "_"), root_folder["id"])
    title_folder = ensure_drive_folder(
        f"{_slugify(item.get('company') or item.get('title'))}-{item.get('id', '')[:8]}",
        area_folder["id"],
    )

    file_meta = upload_file_bytes_to_drive(
        uploaded_file.name,
        uploaded_file.getvalue(),
        uploaded_file.type or "application/octet-stream",
        title_folder["id"],
    )
    return {
        "id": file_meta.get("id"),
        "name": file_meta.get("name", uploaded_file.name),
        "url": file_meta.get("webViewLink", ""),
        "mime_type": file_meta.get("mimeType", uploaded_file.type or ""),
        "created_at": file_meta.get("createdTime", datetime.now().isoformat(timespec="seconds")),
        "folder_id": title_folder["id"],
    }


def upload_crm_documents(item: dict, uploaded_files: list) -> tuple[list[dict], list[str]]:
    uploaded_documents = []
    errors = []

    for uploaded_file in uploaded_files:
        try:
            uploaded_documents.append(upload_crm_document(item, uploaded_file))
        except Exception as exc:
            errors.append(f"{uploaded_file.name}: {exc}")

    return uploaded_documents, errors
