import copy
import json
from pathlib import Path
from lxml import html, etree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Encuesta_Ignite_2026_v2.html"
OUTPUT = ROOT / "public" / "question-bank.js"

doc = html.fromstring(SOURCE.read_text(encoding="utf-8"))


def has_class(node, name):
    return name in (node.get("class") or "").split()


def question_code(node):
    found = node.xpath('.//span[contains(concat(" ", normalize-space(@class), " "), " code ")][1]')
    return " ".join(found[0].text_content().split()) if found else ""


def clean_question(node, scope):
    node = copy.deepcopy(node)
    node.set("data-bank-code", question_code(node))
    for unwanted in node.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " cfg ") or contains(concat(" ", normalize-space(@class), " "), " chips ")]'):
        unwanted.getparent().remove(unwanted)
    for control in node.xpath('.//input[@name] | .//textarea[@name] | .//select[@name]'):
        name = control.get("name")
        control.set("data-key", f"bank.{scope}.{name}")
        control.attrib.pop("checked", None)
        if control.tag == "input" and control.get("type") in ("radio", "checkbox"):
            control.set("name", f"bank-{scope}-{name}")
        inside_other = bool(control.xpath('ancestor::*[contains(concat(" ", normalize-space(@class), " "), " other ")]'))
        if not inside_other and not (control.tag == "input" and control.get("type") == "checkbox"):
            control.set("required", "required")
    for group in node.xpath('.//*[@data-group]'):
        checkboxes = group.xpath('.//input[@type="checkbox" and @data-key]')
        if checkboxes:
            group.set("data-required-group", checkboxes[0].get("data-key"))
    # Revisión del 11/11: satisfacción general conserva solo 1–5;
    # innovación mantiene "Sin experiencia suficiente".
    for row in node.xpath('.//tr[th]'):
        label = " ".join("".join(row.xpath('./th[1]//text()')).split())
        if label == "Satisfacción general":
            for option in row.xpath('.//input[@value="Sin experiencia suficiente"]'):
                cell = option.getparent()
                cell.remove(option)
                cell.text = "—"
    return etree.tostring(node, encoding="unicode", method="html")


def section_questions(section_id, scope):
    section = doc.xpath(f'//section[@id="{section_id}"]')[0]
    questions = section.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    return [{"code": question_code(q), "html": clean_question(q, scope)} for q in questions]


products = {}
experience = doc.xpath('//section[@id="experiencia"]')[0]
for product in experience.xpath('.//details[contains(concat(" ", normalize-space(@class), " "), " product ")]'):
    key = product.get("data-block")
    title_nodes = product.xpath('.//span[contains(concat(" ", normalize-space(@class), " "), " pname ")][1]')
    title = " ".join(title_nodes[0].text_content().split()) if title_nodes else key
    questions = product.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    products[key] = {
        "title": title,
        "questions": [{"code": question_code(q), "html": clean_question(q, f"product.{key}")} for q in questions],
    }

bank = {
    "products": products,
    "commercial": section_questions("renovacion", "commercial"),
    "support": section_questions("soporte", "support"),
    "communication": section_questions("comunicacion", "communication"),
    "priorities": section_questions("2027", "priorities"),
}

OUTPUT.write_text(
    "// Generated from Encuesta_Ignite_2026_v2.html. Do not edit question text here.\n"
    "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"Generated {OUTPUT} with {sum(len(v['questions']) for v in products.values())} product questions")
