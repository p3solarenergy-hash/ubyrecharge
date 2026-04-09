import json
import os

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MANIFEST_FILE = os.path.join(APP_DIR, "drive_manifest.json")


def load_drive_manifest() -> dict:
    if os.path.exists(MANIFEST_FILE):
        with open(MANIFEST_FILE, "r", encoding="utf-8") as file:
            return json.load(file)
    return {}


def save_drive_manifest(data: dict):
    with open(MANIFEST_FILE, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
