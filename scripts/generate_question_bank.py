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


def set_question_title(node, title):
    headings = node.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q-head ")]//h4[1]')
    if headings:
        headings[0].text = title


def apply_content_corrections(node, scope, code):
    if scope == "commercial" and code == "1C":
        product_names = ["Koha", "DSpace", "Winkel", "OJS", "LEMB", "CloudLabs", "4PROT", "Taylor & Francis", "MyLOFT"]
        for span in node.xpath('.//label[contains(concat(" ", normalize-space(@class), " "), " opt ")]/span'):
            label = "".join(span.itertext())
            product = next((name for name in product_names if name in label), None)
            if not product:
                continue
            before, after = label.split(product, 1)
            span.clear()
            span.text = before
            strong = etree.SubElement(span, "strong", {"class": "product-name"})
            strong.text = product
            strong.tail = after
    if scope == "commercial" and code == "1D":
        set_question_title(node, "En la última propuesta de contratación o renovación de un producto o servicio de Ignite evaluada en 2026, ¿qué tan clara fue la explicación de lo que incluía?")
    if scope == "support" and code == "2A":
        set_question_title(node, "¿Su institución realizó algún reporte mediante un ticket durante 2026?")
    if scope == "support" and code == "2C":
        set_question_title(node, "Pensando en el acompañamiento de soporte durante 2026, ¿en qué medida está de acuerdo con estas afirmaciones?")
        hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
        if hints:
            hints[0].text = "Una respuesta por fila. 1 · En desacuerdo · 2 · Ni de acuerdo ni en desacuerdo · 3 · De acuerdo."
        table = node.xpath('.//table[1]')
        if table:
            for heading in table[0].xpath('./thead/tr/th[position() > 1]'):
                if " ".join(heading.text_content().split()) not in {"1", "2", "3"}:
                    heading.getparent().remove(heading)
            for option in table[0].xpath('.//tbody//input[@type="radio"]'):
                if option.get("value") not in {"1", "2", "3"}:
                    cell = option.getparent()
                    cell.getparent().remove(cell)
    if scope == "support" and code == "2H":
        set_question_title(node, "¿Te gustaría tener los siguientes datos para la toma de decisiones que te permitan:")
    if scope == "priorities" and code == "5C":
        select = node.xpath('.//select[@id="objetivo-2027"]')
        if select:
            textarea = etree.Element("textarea", {
                "class": "field",
                "id": "objetivo-2027",
                "name": "objetivo-2027",
                "rows": "3",
                "aria-label": "Objetivo prioritario",
            })
            select[0].getparent().replace(select[0], textarea)
        for other in node.xpath('.//*[@id="objetivo-otro"]'):
            other.getparent().remove(other)
        hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")]')
        for hint in hints:
            hint.getparent().remove(hint)


def clean_question(node, scope):
    node = copy.deepcopy(node)
    code = question_code(node)
    node.set("data-bank-code", code)
    apply_content_corrections(node, scope, code)
    for unwanted in node.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " cfg ") or contains(concat(" ", normalize-space(@class), " "), " chips ")]'):
        unwanted.getparent().remove(unwanted)
    for control in node.xpath('.//input[@name] | .//textarea[@name] | .//select[@name]'):
        name = control.get("name")
        control.set("data-key", f"bank.{scope}.{name}")
        control.attrib.pop("checked", None)
        if control.tag == "input" and control.get("type") in ("radio", "checkbox"):
            control.set("name", f"bank-{scope}-{name}")
        other_containers = control.xpath('ancestor::*[contains(concat(" ", normalize-space(@class), " "), " other ")]')
        inside_other = bool(other_containers)
        specified_other = any(container.get("id") for container in other_containers)
        if (not inside_other or specified_other) and not (control.tag == "input" and control.get("type") == "checkbox"):
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
    "support": [question for question in section_questions("soporte", "support") if question["code"] != "2F"],
    "communication": section_questions("comunicacion", "communication"),
    "priorities": section_questions("2027", "priorities"),
}

OUTPUT.write_text(
    "// Generated from Encuesta_Ignite_2026_v2.html. Do not edit question text here.\n"
    "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"Generated {OUTPUT} with {sum(len(v['questions']) for v in products.values())} product questions")
