import copy
import json
import re
from pathlib import Path
from lxml import html, etree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Encuesta_Ignite_2026_v2.html"
CHANGES_SOURCE = ROOT / "Encuesta_Ignite_2026_cambios.html"
OUTPUT = ROOT / "public" / "question-bank.js"
LABELS_OUTPUT = ROOT / "public" / "question-labels.json"
FUTURE_TECH_QUESTION = "¿Qué tecnología, herramienta o producto sería ideal para su institución y le gustaría que hiciera parte del portafolio de Ignite?"

doc = html.fromstring(SOURCE.read_text(encoding="utf-8"))
changes_doc = html.fromstring(CHANGES_SOURCE.read_text(encoding="utf-8"))

OVERRIDES = {
    ("commercial", "1A"): "Pensando en su experiencia con el equipo comercial de Ignite, ¿cómo califica los siguientes aspectos?",
    ("commercial", "1B"): "¿Qué aspecto considera que diferencia positivamente a Ignite frente a otras opciones del mercado?",
    ("commercial", "1C"): "¿Le gustaría adquirir o recibir información sobre otro producto de Ignite?",
    ("commercial", "1D"): "¿Tiene claro qué incluye el producto o servicio que contrató con Ignite y cuáles son las condiciones de la contratación?",
    ("commercial", "1F"): "¿Por qué decidió trabajar con Ignite en lugar de otra marca?",
    ("support", "2A"): "¿Reportó algún ticket durante 2026 desde la institución?",
    ("support", "2C"): "Pensando en el acompañamiento de soporte durante 2026, ¿en qué medida está de acuerdo con estas afirmaciones?",
    ("support", "2H"): "Me gustaría tener los siguientes datos para la toma de decisiones que me permitan:",
    ("priorities", "4A"): "Pensando en 2027, ¿qué prioridad tiene cada uno de estos ámbitos para su área?",
    ("priorities", "5A"): "Ruta bibliotecas · Nuevos servicios de la biblioteca: ¿en qué punto están y cuáles le interesaría crear o fortalecer en 2027?",
    ("priorities", "5A·F"): "Ruta 4PROT · CloudLabs · Formación y aprendizaje práctico: ¿en qué punto están y cuáles le interesaría crear o fortalecer en 2027?",
    ("priorities", "5C"): "Si pudiera priorizar un solo objetivo para 2027, ¿cuál sería?",
    ("priorities", "5D"): FUTURE_TECH_QUESTION,
}


def has_class(node, name):
    return name in (node.get("class") or "").split()


def question_code(node):
    found = node.xpath('.//span[contains(concat(" ", normalize-space(@class), " "), " code ")][1]')
    return " ".join(found[0].text_content().split()) if found else ""


def set_question_title(node, title):
    headings = node.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q-head ")]//h4[1]')
    if headings:
        headings[0].text = title


def normalized(value):
    return " ".join(value.split())


def change_question(title):
    for question in changes_doc.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " q ")]'):
        headings = question.xpath('.//h4[1]')
        if headings and normalized(headings[0].text_content()) == title:
            return copy.deepcopy(question)
    raise ValueError(f"Change question not found: {title}")


def override_question(scope, code, fallback):
    title = OVERRIDES.get((scope, code))
    if not title:
        return copy.deepcopy(fallback)
    node = change_question(title)
    node.set("class", "q")
    for attribute in list(node.attrib):
        if attribute != "class":
            node.attrib.pop(attribute, None)
    for unwanted in node.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " antes ") or contains(concat(" ", normalize-space(@class), " "), " cfg ") or contains(concat(" ", normalize-space(@class), " "), " pill ")]'):
        unwanted.getparent().remove(unwanted)
    heads = node.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q-head ")][1]')
    if heads:
        badge = etree.Element("span", {"class": "code"})
        badge.text = code
        heads[0].insert(0, badge)
    return node


def replace_text(node, old, new):
    for element in node.iter():
        if element.text:
            element.text = element.text.replace(old, new)
        if element.tail:
            element.tail = element.tail.replace(old, new)
        for attribute, value in list(element.attrib.items()):
            element.set(attribute, value.replace(old, new))


def clean_question(node, scope):
    code = question_code(node)
    node = override_question(scope, code, node)
    node.set("data-bank-code", code)
    if scope == "product.marketing":
        replace_text(node, "Marketing Smith", "Smith Marketing")
    if scope == "commercial" and code == "1C":
        replace_text(node, "IG Publishing (IA aplicada)", "IG Publishing con IA")
    for unwanted in node.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " cfg ") or contains(concat(" ", normalize-space(@class), " "), " chips ") or contains(concat(" ", normalize-space(@class), " "), " antes ") or contains(concat(" ", normalize-space(@class), " "), " pill ")]'):
        unwanted.getparent().remove(unwanted)
    for control in node.xpath('.//input[@name] | .//textarea[@name] | .//select[@name]'):
        name = control.get("name")
        if not control.get("value") and control.tag == "input" and control.get("type") in ("radio", "checkbox"):
            labels = control.xpath('ancestor::label[1]')
            if labels:
                spans = labels[0].xpath('./span[1]')
                if spans:
                    control.set("value", normalized(spans[0].text_content()))
            if not control.get("value"):
                cells = control.xpath('ancestor::td[1]')
                if cells:
                    position = len(cells[0].xpath('preceding-sibling::td')) + 2
                    headings = cells[0].xpath(f'ancestor::table[1]/thead/tr/th[{position}]')
                    if headings:
                        control.set("value", normalized(headings[0].text_content()).split(" · ")[0])
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
    # En la ruta de bibliotecas solo los cuatro grupos definidos llevan
    # desplegable. "Otro" conserva únicamente el campo abierto obligatorio.
    if scope == "priorities" and code == "5A":
        for select in node.xpath('.//select[@name="g12-o"]'):
            cell = select.xpath('ancestor::td[1]')[0]
            cell.remove(select)
            cell.text = "—"
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
        display_title = "Smith Marketing" if title == "Marketing Smith" else title
        cleaned_questions.insert(1, open_question(f"{key.upper()}-PROBLEM", f"product.{key}", f"¿Qué problema principal le ayudó a resolver {display_title}?", "problem-resolved"))
    products[key] = {
        "title": "Smith Marketing" if title == "Marketing Smith" else title,
        "questions": cleaned_questions,
    }

# La lista nueva incorpora Scintra y Soporte. Como el documento base no traía
# bloques propios, conservan la misma evaluación general solicitada para todos
# los productos y la segunda pregunta de problema resuelto.
koha_experience = experience.xpath('.//details[@data-block="koha"]//div[contains(concat(" ", normalize-space(@class), " "), " q ")][1]')[0]
for key, title in (("scintra", "Scintra"), ("soporte", "Soporte")):
    experience_question = copy.deepcopy(koha_experience)
    replace_text(experience_question, "Koha", title)
    badge = experience_question.xpath('.//span[contains(concat(" ", normalize-space(@class), " "), " code ")][1]')[0]
    badge.text = f"{key.upper()}1"
    products[key] = {
        "title": title,
        "questions": [
            {"code": badge.text, "html": clean_question(experience_question, f"product.{key}")},
            open_question(f"{key.upper()}-PROBLEM", f"product.{key}", f"¿Qué problema principal le ayudó a resolver {title}?", "problem-resolved"),
        ],
    }

support_questions = [question for question in section_questions("soporte", "support") if question["code"] != "2F"]

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
    "// Generated from Encuesta_Ignite_2026_v2.html plus Encuesta_Ignite_2026_cambios.html. Do not edit question text here.\n"
    "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
LABELS_OUTPUT.write_text(json.dumps(labels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {OUTPUT} with {sum(len(v['questions']) for v in products.values())} product questions")
