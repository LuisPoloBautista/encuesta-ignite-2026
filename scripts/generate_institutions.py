import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Instituciones_encuesta_2026.csv"
JSON_OUTPUT = ROOT / "config" / "institutions.json"

with SOURCE.open(encoding="utf-8-sig", newline="") as source:
    rows = list(csv.DictReader(source))

institutions = [
    {
        "name": row["Institución"].strip(),
        "country": row["País"].strip(),
        "territory": row["Región"].strip(),
    }
    for row in rows
]

if len(institutions) != 59:
    raise ValueError(f"Expected 59 institutions, found {len(institutions)}")

territories = {}
for institution in institutions:
    territories[institution["territory"]] = territories.get(institution["territory"], 0) + 1

if territories != {"México": 20, "Centro y Sudamérica": 39}:
    raise ValueError(f"Unexpected territory totals: {territories}")

JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
JSON_OUTPUT.write_text(json.dumps(institutions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {len(institutions)} institutions: {territories}")
