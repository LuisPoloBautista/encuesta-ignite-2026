import copy
import json
import re
from pathlib import Path
from lxml import html, etree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Encuesta_Ignite_2026_v2.html"
OUTPUT = ROOT / "public" / "question-bank.js"
LABELS_OUTPUT = ROOT / "public" / "question-labels.json"
PROBLEM_SOLVED_QUESTION = "¿Qué problema principal te ayudó a resolver nuestro producto que actualmente tienes?"
FUTURE_TECH_QUESTION = "¿Qué tecnología, herramienta o producto sería ideal para su institución que contará IGNITE con ella?"

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
    if scope == "priorities" and code == "5D":
        set_question_title(node, FUTURE_TECH_QUESTION)


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


def next_code(code):
    match = re.match(r"^(.*?)(\d+)$", code)
    return f"{match.group(1)}{int(match.group(2)) + 1}" if match else f"{code}A"


def open_question(code, scope, title, name):
    node = etree.Element("div", {"class": "q", "data-bank-code": code})
    head = etree.SubElement(node, "div", {"class": "q-head"})
    badge = etree.SubElement(head, "span", {"class": "code"})
    badge.text = code
    heading = etree.SubElement(head, "h4")
    heading.text = title
    etree.SubElement(node, "textarea", {
        "class": "field",
        "name": f"bank-{scope}-{name}",
        "data-key": f"bank.{scope}.{name}",
        "rows": "3",
        "aria-label": "Respuesta",
        "required": "required",
    })
    return {"code": code, "html": etree.tostring(node, encoding="unicode", method="html")}


products = {}
experience = doc.xpath('//section[@id="experiencia"]')[0]
for product in experience.xpath('.//details[contains(concat(" ", normalize-space(@class), " "), " product ")]'):
    key = product.get("data-block")
    title_nodes = product.xpath('.//span[contains(concat(" ", normalize-space(@class), " "), " pname ")][1]')
    title = " ".join(title_nodes[0].text_content().split()) if title_nodes else key
    questions = product.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    cleaned_questions = [{"code": question_code(q), "html": clean_question(q, f"product.{key}")} for q in questions]
    if key != "bd":
        cleaned_questions.append(open_question(next_code(cleaned_questions[-1]["code"]), f"product.{key}", PROBLEM_SOLVED_QUESTION, "problem-resolved"))
    products[key] = {
        "title": title,
        "questions": cleaned_questions,
    }

support_questions = [question for question in section_questions("soporte", "support") if question["code"] != "2F"]
support_questions.append(open_question("2I", "support", PROBLEM_SOLVED_QUESTION, "problem-resolved"))

bank = {
    "products": products,
    "commercial": section_questions("renovacion", "commercial"),
    "support": support_questions,
    "communication": section_questions("comunicacion", "communication"),
    "priorities": section_questions("2027", "priorities"),
}


def control_labels(questions, section_title):
    labels = {}
    for question in questions:
        fragment = html.fragment_fromstring(question["html"])
        headings = fragment.xpath('.//h4[1]')
        question_title = " ".join(headings[0].text_content().split()) if headings else question["code"]
        for control in fragment.xpath('.//*[@data-key]'):
            parts = [section_title, question_title]
            rows = control.xpath('ancestor::tr[1]')
            if rows:
                row_headings = rows[0].xpath('./th[1]')
                if row_headings:
                    row_label = " ".join(row_headings[0].text_content().split())
                    if row_label and row_label != question_title:
                        parts.append(row_label)
            others = control.xpath('ancestor::*[contains(concat(" ", normalize-space(@class), " "), " other ")][1]')
            if others:
                captions = others[0].xpath('./span[1]')
                caption = " ".join(captions[0].text_content().split()) if captions else "Especifique"
                if caption:
                    parts.append(caption)
            labels[control.get("data-key")] = " — ".join(dict.fromkeys(parts))
    return labels


labels = {
    "products": "Productos y servicios utilizados",
    "consent.anonymous_study": "Autorización para utilizar respuestas anónimas en un estudio del sector",
}
for product in products.values():
    labels.update(control_labels(product["questions"], product["title"]))
labels.update(control_labels(bank["commercial"], "Asesoría y acompañamiento comercial"))
labels.update(control_labels(bank["support"], "Soporte y acompañamiento"))
labels.update(control_labels(bank["communication"], "Marketing y comunicación"))
labels.update(control_labels(bank["priorities"], "Prioridades para 2027"))

OUTPUT.write_text(
    "// Generated from Encuesta_Ignite_2026_v2.html. Do not edit question text here.\n"
    "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
LABELS_OUTPUT.write_text(json.dumps(labels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {OUTPUT} with {sum(len(v['questions']) for v in products.values())} product questions")
