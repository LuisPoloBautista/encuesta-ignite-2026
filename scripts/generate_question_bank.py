import copy
import json
import re
from pathlib import Path
from lxml import html, etree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Encuesta_Ignite_2026_v2.html"
CHANGES_SOURCE = ROOT / "Encuesta_Ignite_2026_cambios.html"
PRODUCT_CHANGES_SOURCE = ROOT / "Encuesta_Ignite_2026_cambios_productos.html"
OUTPUT = ROOT / "public" / "question-bank.js"
LABELS_OUTPUT = ROOT / "public" / "question-labels.json"
FUTURE_TECH_QUESTION = "¿Qué tecnología, herramienta o producto sería ideal para su institución y le gustaría que hiciera parte del portafolio de Ignite?"

doc = html.fromstring(SOURCE.read_text(encoding="utf-8"))
changes_doc = html.fromstring(CHANGES_SOURCE.read_text(encoding="utf-8"))
product_changes_doc = html.fromstring(PRODUCT_CHANGES_SOURCE.read_text(encoding="utf-8"))

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


def rewrite_product_option(node, product, value, leading_text="", trailing_text=""):
    product_names = node.xpath(f'.//*[contains(concat(" ", normalize-space(@class), " "), " prodname ") and normalize-space()="{product}"]')
    if not product_names:
        return
    product_name = product_names[0]
    labels = product_name.xpath('ancestor::label[1]')
    if not labels:
        return
    label = labels[0]
    inputs = label.xpath('.//input[1]')
    if inputs:
        inputs[0].set("value", value)
    spans = label.xpath('./span[1]')
    if not spans:
        return
    span = spans[0]
    span.clear()
    span.text = leading_text
    brand = etree.SubElement(span, "b", {"class": "prodname"})
    brand.text = product
    brand.tail = trailing_text


def rewrite_support_combined_evaluation(node):
    set_question_title(
        node,
        "Pensando en el soporte y acompañamiento recibido durante 2026, ¿en qué medida está de acuerdo con estas afirmaciones?",
    )
    hint_text = (
        "Una respuesta por fila. 1 · Totalmente en desacuerdo a 5 · Totalmente de acuerdo. "
        "Opción adicional: No aplica o no lo sé."
    )
    hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
    if hints:
        hints[0].text = hint_text
    else:
        hint = etree.Element("p", {"class": "hint"})
        hint.text = hint_text
        heads = node.xpath('./div[contains(concat(" ", normalize-space(@class), " "), " q-head ")][1]')
        node.insert(node.index(heads[0]) + 1 if heads else 0, hint)

    rows = [
        (
            "Gestión de incidencias",
            "Fue fácil reportar incidencias en la Mesa de Servicio. Recibimos una primera respuesta a tiempo y los casos se resolvieron en el plazo que necesitábamos, sin que los problemas volvieran a presentarse.",
        ),
        (
            "Trato, comunicación y coordinación",
            "Soporte nos atendió con cordialidad y respeto, entendió cómo nos afectó la incidencia, nos mantuvo al tanto sin que tuviéramos que pedirlo y explicó qué ocurrió y cómo lo resolvió. Cuando hizo falta, se coordinó eficazmente con nuestra área de TI.",
        ),
        (
            "Satisfacción general",
            "En general, nuestra experiencia con el servicio de soporte de Ignite fue satisfactoria.",
        ),
        (
            "Capacitación y aprendizaje",
            "En las capacitaciones de Ignite aprendí más de lo que esperaba y desarrollé habilidades útiles para mi trabajo.",
        ),
        (
            "Acompañamiento y seguimiento",
            "Contamos con expertos dispuestos a ayudarnos a alcanzar nuestros objetivos. Las reuniones de seguimiento fueron productivas y nos permitieron tener claro el plan de acción y su porcentaje de cumplimiento.",
        ),
        (
            "Resultados y retorno de la inversión",
            "Ignite nos ayudó a avanzar en la transformación tecnológica de nuestra unidad y nos resultó fácil demostrar el retorno de la inversión.",
        ),
        (
            "Club de Miembros",
            "Conozco el Club de Miembros de Ignite.",
        ),
    ]
    values = ["1", "2", "3", "4", "5", "No aplica o no lo sé"]
    tables = node.xpath('.//table[1]')
    if not tables:
        return
    table = tables[0]
    table.clear()
    table.set("class", "grid support-combined-grid")
    head = etree.SubElement(table, "thead")
    head_row = etree.SubElement(head, "tr")
    for index, heading_text in enumerate(["Aspecto", "Afirmación", *values]):
        attributes = {"scope": "col"}
        if index == 0:
            attributes["class"] = "first"
        heading = etree.SubElement(head_row, "th", attributes)
        heading.text = heading_text
    body = etree.SubElement(table, "tbody")
    for index, (aspect, statement) in enumerate(rows, start=1):
        row = etree.SubElement(body, "tr")
        aspect_heading = etree.SubElement(row, "th", {"scope": "row"})
        aspect_heading.text = f"{index}. {aspect}"
        statement_cell = etree.SubElement(row, "td", {"class": "support-statement"})
        statement_cell.text = statement
        for value in values:
            attributes = {"class": "na"} if value == "No aplica o no lo sé" else {}
            cell = etree.SubElement(row, "td", attributes)
            etree.SubElement(cell, "input", {
                "type": "radio",
                "name": f"support-merged-{index}",
                "value": value,
                "aria-label": f"{aspect}: {value}",
            })


def rewrite_support_report_questions(node):
    set_question_title(node, "Uso de los informes")
    hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
    if hints:
        hints[0].text = "Seleccione todas las opciones que correspondan."
    options = [
        (
            "Sustentar decisiones de presupuesto",
            "Identificar qué recursos o contenidos se usan más y menos para decidir cuáles renovar, sustituir o incorporar.",
        ),
        (
            "Orientar la formación y la difusión",
            "Saber cuántas personas usan cada plataforma o recurso e identificar dónde hay menor uso, por perfil (estudiantes, docentes, investigadores u otros), carrera, facultad o sede.",
        ),
        (
            "Evaluar las acciones de formación y difusión",
            "Ver cómo evoluciona el uso a lo largo del tiempo y si cambia después de una capacitación o campaña.",
        ),
        (
            "Dar seguimiento a las metas de uso",
            "Verificar el avance frente a las metas del área con datos de las actividades de cada plataforma, como consultas, descargas, préstamos o publicaciones.",
        ),
        (
            "Comunicar los resultados de la biblioteca",
            "Presentar los resultados de uso a las autoridades y a la comunidad académica.",
        ),
        (
            "Documentar evidencias institucionales",
            "Contar con datos para procesos de acreditación o evaluación institucional.",
        ),
    ]
    groups = node.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " opts ")][1]')
    if not groups:
        return
    group = groups[0]
    group.clear()
    group.set("class", "opts report-question-options")
    group.set("data-group", "")
    for question, description in options:
        label = etree.SubElement(group, "label", {"class": "opt"})
        etree.SubElement(label, "input", {"type": "checkbox", "name": "o157", "value": question})
        copy = etree.SubElement(label, "span", {"class": "report-question-copy"})
        strong = etree.SubElement(copy, "strong")
        strong.text = question
        small = etree.SubElement(copy, "small")
        small.text = description


def rewrite_eds_experience(node):
    title = "Pensando en 2026, ¿en qué medida está de acuerdo con estas afirmaciones sobre EDS (EBSCO Discovery Service)?"
    statements = [
        "En general, estamos satisfechos con EDS como punto único de búsqueda de la biblioteca.",
        "Los resultados de búsqueda son relevantes y ayudan a los usuarios a encontrar lo que necesitan con rapidez.",
        "Los enlaces al texto completo funcionan de forma confiable y llevan directamente al documento.",
        "EDS integra adecuadamente nuestros recursos (bases suscritas, catálogo, repositorio institucional y recursos abiertos).",
        "EDS ha aumentado la visibilidad y el uso de los recursos que suscribimos.",
        "Las capacitaciones sobre EDS dejan aprendizajes que nuestra comunidad aplica en sus búsquedas y trabajos académicos.",
    ]
    values = ["1", "2", "3", "4", "5", "Sin experiencia suficiente"]
    set_question_title(node, title)
    hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
    if hints:
        hints[0].text = "Una respuesta por fila. 1 · Totalmente en desacuerdo a 5 · Totalmente de acuerdo. Opción adicional: Sin experiencia suficiente."
    bodies = node.xpath('.//table/tbody[1]')
    if not bodies:
        return
    body = bodies[0]
    existing_names = body.xpath('.//input[@name][1]/@name')
    name_stem = existing_names[0].rsplit("-", 1)[0] if existing_names else "eds-experience"
    body.clear()
    for index, statement in enumerate(statements, start=1):
        row = etree.SubElement(body, "tr")
        heading = etree.SubElement(row, "th", {"scope": "row"})
        heading.text = statement
        for value in values:
            attributes = {"class": "na"} if value == "Sin experiencia suficiente" else {}
            cell = etree.SubElement(row, "td", attributes)
            etree.SubElement(cell, "input", {
                "type": "radio",
                "name": f"{name_stem}-{index}",
                "value": value,
                "aria-label": f"{statement} {value}",
            })


def rewrite_eds_improvement(node):
    set_question_title(node, "Si pudiese mejorar una sola cosa de EDS, ¿qué sería?")
    textareas = node.xpath('.//textarea[1]')
    if textareas:
        textareas[0].set("aria-label", "Mejora principal para EDS")


def rewrite_myloft_experience(node):
    title = "Pensando en su experiencia con MyLOFT durante 2026, ¿qué tan de acuerdo está con estas afirmaciones?"
    statements = [
        "En general, estamos satisfechos con MyLOFT.",
        "Nuestros usuarios acceden sin dificultad a los recursos habilitados, dentro y fuera del campus.",
        "La implementación o migración se realizó de forma ordenada y en los plazos acordados.",
        "Cuando tuvimos problemas, la solución respondió al impacto en nuestro servicio.",
        "Podemos gestionar recursos y usuarios, consultar estadísticas de uso y personalizar el portal sin depender del equipo técnico.",
    ]
    values = ["1", "2", "3", "4", "5", "No aplica o no lo sé"]
    set_question_title(node, title)
    hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
    hint_text = (
        "Una respuesta por fila. 1 · Totalmente en desacuerdo a 5 · Totalmente de acuerdo. "
        "Opción adicional: No aplica o no lo sé."
    )
    if hints:
        hints[0].text = hint_text
    else:
        hint = etree.Element("p", {"class": "hint"})
        hint.text = hint_text
        heads = node.xpath('./div[contains(concat(" ", normalize-space(@class), " "), " q-head ")][1]')
        node.insert(node.index(heads[0]) + 1 if heads else 0, hint)
    tables = node.xpath('.//table[1]')
    if not tables:
        return
    table = tables[0]
    table.clear()
    table.set("class", "grid")
    head = etree.SubElement(table, "thead")
    head_row = etree.SubElement(head, "tr")
    for index, value in enumerate(["Afirmación", *values]):
        attributes = {"scope": "col"}
        if index == 0:
            attributes["class"] = "first"
        heading = etree.SubElement(head_row, "th", attributes)
        heading.text = value
    body = etree.SubElement(table, "tbody")
    for index, statement in enumerate(statements, start=1):
        row = etree.SubElement(body, "tr")
        row_heading = etree.SubElement(row, "th", {"scope": "row"})
        row_heading.text = statement
        for value in values:
            attributes = {"class": "na"} if value == "No aplica o no lo sé" else {}
            cell = etree.SubElement(row, "td", attributes)
            etree.SubElement(cell, "input", {
                "type": "radio",
                "name": f"myloft-2026-{index}",
                "value": value,
                "aria-label": f"{statement} {value}",
            })


def rewrite_koha_results(node):
    title = "Pensando en los resultados que su biblioteca obtuvo con Koha en 2026, ¿qué tan de acuerdo está con estas afirmaciones?"
    statements = [
        "Valor de las mejoras. Las mejoras de Koha nos permitieron realizar con mayor facilidad tareas importantes de la biblioteca.",
        "Continuidad del servicio. La rapidez y la estabilidad de Koha nos permitieron mantener el servicio incluso en horas de mayor demanda.",
        "Autonomía del personal. Después de las capacitaciones, nuestro equipo pudo realizar sus tareas habituales en Koha sin depender de soporte.",
        "Autonomía de los usuarios. Nuestros usuarios pudieron encontrar materiales, reservarlos y renovar sus préstamos desde el catálogo sin acudir al mostrador.",
        "Decisiones sobre la colección. Los reportes de Koha nos permitieron usar datos de uso y costo para sustentar decisiones de compra y renovación ante nuestras autoridades.",
    ]
    values = ["1", "2", "3", "4", "5", "No aplica o no lo sé"]
    set_question_title(node, title)
    hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
    hint_text = (
        "Una respuesta por fila. 1 = Totalmente en desacuerdo · "
        "5 = Totalmente de acuerdo · «No aplica o no lo sé»."
    )
    if hints:
        hints[0].text = hint_text
    else:
        hint = etree.Element("p", {"class": "hint"})
        hint.text = hint_text
        heads = node.xpath('./div[contains(concat(" ", normalize-space(@class), " "), " q-head ")][1]')
        node.insert(node.index(heads[0]) + 1 if heads else 0, hint)
    tables = node.xpath('.//table[1]')
    if not tables:
        return
    table = tables[0]
    table.clear()
    table.set("class", "grid")
    head = etree.SubElement(table, "thead")
    head_row = etree.SubElement(head, "tr")
    for index, value in enumerate(["Afirmación", *values]):
        attributes = {"scope": "col"}
        if index == 0:
            attributes["class"] = "first"
        heading = etree.SubElement(head_row, "th", attributes)
        heading.text = value
    body = etree.SubElement(table, "tbody")
    for index, statement in enumerate(statements, start=1):
        row = etree.SubElement(body, "tr")
        row_heading = etree.SubElement(row, "th", {"scope": "row"})
        row_heading.text = statement
        for value in values:
            attributes = {"class": "na"} if value == "No aplica o no lo sé" else {}
            cell = etree.SubElement(row, "td", attributes)
            etree.SubElement(cell, "input", {
                "type": "radio",
                "name": f"koha-results-2026-{index}",
                "value": value,
                "aria-label": f"{statement} {value}",
            })


def rewrite_dspace_results(node):
    title = "Pensando en su repositorio DSpace durante 2026, ¿qué tan de acuerdo está con estas afirmaciones?"
    rows = [
        (
            "Funcionamiento y accesibilidad",
            "El repositorio es estable y accesible, y permite depositar, revisar y publicar documentos con agilidad.",
        ),
        (
            "Actualización e innovación",
            "Las actualizaciones de DSpace incorporaron mejoras útiles para nuestro trabajo, como funciones de IA para describir documentos, detectar duplicados o mejorar la búsqueda.",
        ),
        (
            "Gestión de la investigación y ciencia abierta",
            "El repositorio nos ayuda a gestionar perfiles, proyectos y financiamiento, y a publicar datos de investigación según los principios FAIR.",
        ),
        (
            "Visibilidad e impacto",
            "Usamos identificadores persistentes, nuestros registros son recolectados por redes como OpenAIRE o LA Referencia y contamos con métricas para comunicar su alcance.",
        ),
        (
            "Preservación digital",
            "Contamos con una política de preservación digital alineada con estándares reconocidos.",
        ),
    ]
    values = ["1", "2", "3", "4", "5", "No aplica o no lo sé"]
    set_question_title(node, title)
    hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
    hint_text = (
        "Una respuesta por fila. 1 = Totalmente en desacuerdo · "
        "5 = Totalmente de acuerdo · «No aplica o no lo sé»."
    )
    if hints:
        hints[0].text = hint_text
    else:
        hint = etree.Element("p", {"class": "hint"})
        hint.text = hint_text
        heads = node.xpath('./div[contains(concat(" ", normalize-space(@class), " "), " q-head ")][1]')
        node.insert(node.index(heads[0]) + 1 if heads else 0, hint)
    tables = node.xpath('.//table[1]')
    if not tables:
        return
    table = tables[0]
    table.clear()
    table.set("class", "grid aspect-rating-grid")
    head = etree.SubElement(table, "thead")
    head_row = etree.SubElement(head, "tr")
    for index, value in enumerate(["Aspecto", "Afirmación", *values]):
        attributes = {"scope": "col"}
        if index == 0:
            attributes["class"] = "first"
        heading = etree.SubElement(head_row, "th", attributes)
        heading.text = value
    body = etree.SubElement(table, "tbody")
    for index, (aspect, statement) in enumerate(rows, start=1):
        row = etree.SubElement(body, "tr")
        row_heading = etree.SubElement(row, "th", {"scope": "row"})
        row_heading.text = f"{index}. {aspect}"
        statement_cell = etree.SubElement(row, "td", {"class": "aspect-statement"})
        statement_cell.text = statement
        for value in values:
            attributes = {"class": "na"} if value == "No aplica o no lo sé" else {}
            cell = etree.SubElement(row, "td", attributes)
            etree.SubElement(cell, "input", {
                "type": "radio",
                "name": f"dspace-2026-{index}",
                "value": value,
                "aria-label": f"{aspect}: {value}",
            })


def rewrite_support_agreement_scale(node):
    hints = node.xpath('.//p[contains(concat(" ", normalize-space(@class), " "), " hint ")][1]')
    if hints:
        hints[0].text = "Una respuesta por fila. 1 · Totalmente en desacuerdo a 5 · Totalmente de acuerdo."
    else:
        hint = etree.Element("p", {"class": "hint"})
        hint.text = "Una respuesta por fila. 1 · Totalmente en desacuerdo a 5 · Totalmente de acuerdo."
        heads = node.xpath('./div[contains(concat(" ", normalize-space(@class), " "), " q-head ")][1]')
        node.insert(node.index(heads[0]) + 1 if heads else 0, hint)
    for table in node.xpath('.//table'):
        header_rows = table.xpath('./thead/tr[1]')
        if not header_rows:
            continue
        header_row = header_rows[0]
        for heading in header_row.xpath('./th[position() > 1]'):
            header_row.remove(heading)
        for value in range(1, 6):
            heading = etree.SubElement(header_row, "th", {"scope": "col"})
            heading.text = str(value)
        for row in table.xpath('./tbody/tr[th]'):
            existing_inputs = row.xpath('.//input[@name][1]')
            if not existing_inputs:
                continue
            name = existing_inputs[0].get("name")
            row_label = normalized("".join(row.xpath('./th[1]//text()')))
            for cell in row.xpath('./td'):
                row.remove(cell)
            for value in range(1, 6):
                cell = etree.SubElement(row, "td")
                etree.SubElement(cell, "input", {
                    "type": "radio",
                    "name": name,
                    "value": str(value),
                    "aria-label": f"{row_label}: {value}",
                })


def clean_question(node, scope):
    code = question_code(node)
    node = override_question(scope, code, node)
    optional = bool(node.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " chip-opt ")]'))
    if scope == "product.dspace" and code == "4.4":
        optional = False
    node.set("data-bank-code", code)
    if optional:
        node.set("data-optional", "true")
    if scope == "product.marketing":
        replace_text(node, "Marketing Smith", "Smith Marketing")
    if scope == "commercial" and code == "1C":
        replace_text(node, "IG Publishing (IA aplicada)", "IG Publishing con IA")
        rewrite_product_option(
            node,
            "MyLOFT",
            "Reúne los recursos digitales en un solo acceso, donde puedes buscarlos, guardarlos, organizarlos y leerlos desde cualquier lugar. MyLOFT",
            "Reúne los recursos digitales en un solo acceso, donde puedes buscarlos, guardarlos, organizarlos y leerlos desde cualquier lugar. ",
        )
        rewrite_product_option(
            node,
            "Winkel",
            "Biblioteca digital para publicar tus libros electrónicos con la mejor experiencia de lectura. Winkel",
            "Biblioteca digital para publicar tus libros electrónicos con la mejor experiencia de lectura. ",
        )
    if scope == "support" and code == "2B":
        rewrite_support_combined_evaluation(node)
    if scope == "support" and code == "2E":
        set_question_title(node, "¿Qué necesita aprender para afrontar su profesión mejor en el 2027?")
    if scope == "support" and code == "2G":
        rewrite_support_report_questions(node)
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
        if (not optional or specified_other) and (not inside_other or specified_other) and not (control.tag == "input" and control.get("type") == "checkbox"):
            control.set("required", "required")
    for group in node.xpath('.//*[@data-group]'):
        checkboxes = group.xpath('.//input[@type="checkbox" and @data-key]')
        if checkboxes and not optional:
            group.set("data-required-group", checkboxes[0].get("data-key"))
    # En la ruta de bibliotecas solo los cuatro grupos definidos llevan
    # desplegable. "Otro" conserva únicamente el campo abierto obligatorio.
    if scope == "priorities" and code == "5A":
        for select in node.xpath('.//select[@name="g12-o"]'):
            cell = select.xpath('ancestor::td[1]')[0]
            cell.remove(select)
            cell.text = "—"
        for other_input in node.xpath('.//input[@name="g12-otro"]'):
            other_input.attrib.pop("required", None)
            other_input.set("placeholder", "Especifique (opcional)")
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


PRIORITIES_2027_HTML = """
<section id="priorities-2027-new">
  <div class="q">
    <div class="q-head"><span class="code">5.1</span><h4>¿Cuáles son los TRES desafíos más importantes para su institución en 2027? (seleccione tres)</h4></div>
    <div class="opts" data-group data-min="3" data-max="3">
      <label class="opt"><input type="checkbox" name="challenges" value="Demostrar ante las autoridades el valor y el impacto de la biblioteca"><span>Demostrar ante las autoridades el valor y el impacto de la biblioteca</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Sostener o justificar el presupuesto de recursos y suscripciones"><span>Sostener o justificar el presupuesto de recursos y suscripciones</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Definir lineamientos para el uso de la inteligencia artificial"><span>Definir lineamientos para el uso de la inteligencia artificial</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Formar a estudiantes y docentes en alfabetización informacional y en IA"><span>Formar a estudiantes y docentes en alfabetización informacional y en IA</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Actualizar las competencias del equipo de la biblioteca"><span>Actualizar las competencias del equipo de la biblioteca</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Aumentar la visibilidad e indexación de la producción científica"><span>Aumentar la visibilidad e indexación de la producción científica</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Fortalecer la integridad científica y las buenas prácticas de publicación"><span>Fortalecer la integridad científica y las buenas prácticas de publicación</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Ofrecer un acceso simple a los recursos, dentro y fuera del campus"><span>Ofrecer un acceso simple a los recursos, dentro y fuera del campus</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Consolidar la biblioteca como espacio de aprendizaje y permanencia estudiantil"><span>Consolidar la biblioteca como espacio de aprendizaje y permanencia estudiantil</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Garantizar la estabilidad y la seguridad de las plataformas"><span>Garantizar la estabilidad y la seguridad de las plataformas</span></label>
      <label class="opt"><input type="checkbox" name="challenges" value="Otro" data-other="priority-challenges-other"><span>Otro</span></label>
      <label class="other" id="priority-challenges-other" hidden><span>Especifique (obligatorio)</span><input type="text" name="challenges-other" disabled required></label>
    </div>
  </div>
  <div class="q">
    <div class="q-head"><span class="code">5.2</span><h4>Para cada servicio, indique la situación de su biblioteca:</h4></div>
    <p class="hint">Escala: Ya lo ofrecemos y funciona bien · Queremos fortalecerlo en 2027 · Queremos crearlo en 2027 · No es prioridad en 2027 · No aplica</p>
    <div class="tw" tabindex="0" role="region" aria-label="Situación de los servicios"><table class="grid"><thead><tr><th scope="col" class="first">Servicio</th><th scope="col">Ya lo ofrecemos y funciona bien</th><th scope="col">Queremos fortalecerlo en 2027</th><th scope="col">Queremos crearlo en 2027</th><th scope="col">No es prioridad en 2027</th><th scope="col">No aplica</th></tr></thead><tbody>
      <tr><th scope="row">Asesoría para elegir revistas confiables y evitar revistas depredadoras</th></tr>
      <tr><th scope="row">Revisiones de literatura y síntesis de evidencia con apoyo de IA</th></tr>
      <tr><th scope="row">Apoyo en la redacción y preparación de artículos</th></tr>
      <tr><th scope="row">Acompañamiento a revistas propias hacia la indexación (Scopus, SciELO, WoS)</th></tr>
      <tr><th scope="row">Inteligencia de investigación: tendencias, colaboraciones e impacto</th></tr>
      <tr><th scope="row">Contenidos de la biblioteca integrados en cursos y aulas virtuales</th></tr>
      <tr><th scope="row">Formación en uso de IA, evaluación de información e integridad académica</th></tr>
      <tr><th scope="row">Analítica de uso para decidir inversiones y demostrar valor</th></tr>
      <tr><th scope="row">Campañas de promoción para aumentar el uso de los recursos</th></tr>
    </tbody></table></div>
  </div>
  <div class="q">
    <div class="q-head"><span class="code">5.3</span><h4>¿Cuál es el principal obstáculo para avanzar en sus prioridades de 2027? (una opción)</h4></div>
    <div class="opts" data-group>
      <label class="opt"><input type="radio" name="obstacle" value="Presupuesto"><span>Presupuesto</span></label>
      <label class="opt"><input type="radio" name="obstacle" value="Personal insuficiente"><span>Personal insuficiente</span></label>
      <label class="opt"><input type="radio" name="obstacle" value="Competencias del equipo"><span>Competencias del equipo</span></label>
      <label class="opt"><input type="radio" name="obstacle" value="Apoyo directivo"><span>Apoyo directivo</span></label>
      <label class="opt"><input type="radio" name="obstacle" value="Limitaciones tecnológicas"><span>Limitaciones tecnológicas</span></label>
      <label class="opt"><input type="radio" name="obstacle" value="Falta de datos para justificar la necesidad"><span>Falta de datos para justificar la necesidad</span></label>
      <label class="opt"><input type="radio" name="obstacle" value="Procesos internos o de compra"><span>Procesos internos o de compra</span></label>
      <label class="opt"><input type="radio" name="obstacle" value="Otro" data-other="priority-obstacle-other"><span>Otro</span></label>
      <label class="other" id="priority-obstacle-other" hidden><span>Especifique (obligatorio)</span><input type="text" name="obstacle-other" disabled required></label>
    </div>
  </div>
  <div class="q">
    <div class="q-head"><span class="code">5.4</span><h4>Para 2027, usted espera que el presupuesto de su biblioteca:</h4></div>
    <div class="opts" data-group>
      <label class="opt"><input type="radio" name="budget" value="Aumente"><span>Aumente</span></label>
      <label class="opt"><input type="radio" name="budget" value="Se mantenga"><span>Se mantenga</span></label>
      <label class="opt"><input type="radio" name="budget" value="Disminuya, con posibles recortes de suscripciones o servicios"><span>Disminuya, con posibles recortes de suscripciones o servicios</span></label>
      <label class="opt"><input type="radio" name="budget" value="Aún no lo sé"><span>Aún no lo sé</span></label>
    </div>
  </div>
  <div class="q">
    <div class="q-head"><span class="code">5.5</span><h4>¿Qué soluciones NO tiene hoy su biblioteca y le gustaría incorporar en 2027? (seleccione hasta tres)</h4></div>
    <div class="opts" data-group data-max="3">
      <label class="opt"><input type="checkbox" name="solutions" value="Acceso remoto unificado a todas las bases de datos y recursos electrónicos"><span>Acceso remoto unificado a todas las bases de datos y recursos electrónicos</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Búsqueda inteligente con IA en el catálogo y las colecciones"><span>Búsqueda inteligente con IA en el catálogo y las colecciones</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Un sistema de gestión bibliotecaria más moderno (catálogo y procesos técnicos)"><span>Un sistema de gestión bibliotecaria más moderno (catálogo y procesos técnicos)</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Apoyo a la catalogación con encabezamientos de materia normalizados"><span>Apoyo a la catalogación con encabezamientos de materia normalizados</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Repositorio institucional para la producción científica"><span>Repositorio institucional para la producción científica</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Sistema de gestión de la investigación (perfiles de investigadores, proyectos y producción)"><span>Sistema de gestión de la investigación (perfiles de investigadores, proyectos y producción)</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Plataforma para gestionar y publicar revistas científicas"><span>Plataforma para gestionar y publicar revistas científicas</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Plataforma de lectura en línea para libros propios o adquiridos"><span>Plataforma de lectura en línea para libros propios o adquiridos</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Nuevas bases de datos o colecciones de contenido científico"><span>Nuevas bases de datos o colecciones de contenido científico</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Laboratorios virtuales para la práctica de los estudiantes"><span>Laboratorios virtuales para la práctica de los estudiantes</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Plataforma para que los estudiantes desarrollen proyectos y prototipos"><span>Plataforma para que los estudiantes desarrollen proyectos y prototipos</span></label>
      <label class="opt"><input type="checkbox" name="solutions" value="Ninguna por ahora" data-exclusive><span>Ninguna por ahora</span></label>
    </div>
  </div>
  <div class="q">
    <div class="q-head"><span class="code">5.6</span><h4>¿Qué tecnología, herramienta o producto sería ideal para su institución y le gustaría que hiciera parte del portafolio de Ignite?</h4><span class="chip-opt">Opcional</span></div>
    <textarea class="field" name="ideal-technology" rows="3" aria-label="Respuesta"></textarea>
  </div>
  <div class="q">
    <div class="q-head"><span class="code">5.7</span><h4>Si pudiera resolver un solo problema de su biblioteca en 2027, ¿cuál sería y qué cambiaría para su institución si lo lograra?</h4><span class="chip-opt">Opcional</span></div>
    <textarea class="field" name="single-problem" rows="3" aria-label="Respuesta"></textarea>
  </div>
</section>
"""


def priority_questions_2027():
    section = html.fromstring(PRIORITIES_2027_HTML)
    questions = section.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    services = questions[1].xpath('.//tbody/tr')
    scale = [
        "Ya lo ofrecemos y funciona bien",
        "Queremos fortalecerlo en 2027",
        "Queremos crearlo en 2027",
        "No es prioridad en 2027",
        "No aplica",
    ]
    for index, row in enumerate(services, start=1):
        row_label = normalized(row.xpath('string(./th[1])'))
        for value in scale:
            cell = etree.SubElement(row, "td")
            etree.SubElement(cell, "input", {
                "type": "radio",
                "name": f"service-{index}",
                "value": value,
                "aria-label": f"{row_label}: {value}",
            })
    return [{"code": question_code(question), "html": clean_question(question, "priorities")} for question in questions]


def learning_priority_questions_2027():
    """Ruta 2027 mostrada cuando la institución usa 4PROT o CloudLabs."""
    source_questions = doc.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    questions_by_code = {question_code(question): question for question in source_questions}
    selected = []
    for code in ("5A·F", "5B", "5C", "5D"):
        source_question = questions_by_code[code]
        revised_question = override_question("priorities", code, source_question)
        if code == "5A·F":
            set_question_title(
                revised_question,
                "Formación y aprendizaje práctico: ¿en qué punto están estas iniciativas y cuáles le interesaría crear o fortalecer en 2027?",
            )
        selected.append({"code": code, "html": clean_question(revised_question, "learning_priorities")})
    return selected


# Transcripción fiel de preguntas4prot/Encuestas_Satisfaccion_4PROT_CloudLabs_v_02.docx.
# Se conserva aquí para que el formulario generado no dependa del DOCX binario,
# que funciona como documento de referencia local y no se publica en Render.
LEARNING_PRODUCT_SURVEYS = {
    "4prot": {
        "title": "4PROT",
        "satisfaction_name": "m57-1",
        "aspect_names": ["m57-3", "m57-4", "m57-5", "m57-6"],
        "achievement_name": "o59",
        "recommendation_name": "m60-1",
        "plan_name": "o61",
        "improvement_name": "t62",
        "case_name": "c63",
        "achievements": [
            "Mayor participación de los estudiantes",
            "Mejor trabajo en equipo y colaboración",
            "Los estudiantes prototipan sus ideas antes de llevarlas a la práctica",
            "Aplicar Design Thinking en clase",
            "Aún es pronto para saberlo",
        ],
    },
    "cloudlabs": {
        "title": "CloudLabs",
        "satisfaction_name": "m64-1",
        "aspect_names": ["m64-3", "m64-4", "m64-5", "m64-6"],
        "achievement_name": "o66",
        "recommendation_name": "m67-1",
        "plan_name": "o68",
        "improvement_name": "t69",
        "case_name": "c70",
        "achievements": [
            "Los estudiantes aprenden haciendo",
            "Llegan mejor preparados a la práctica o a las evaluaciones",
            "Más estudiantes acceden a experiencias prácticas",
            "Practican sin límites de tiempo, insumos o riesgo",
            "Aún es pronto para saberlo",
        ],
    },
}


def learning_product_questions(key):
    survey = LEARNING_PRODUCT_SURVEYS[key]
    title = survey["title"]
    aspect_labels = [
        "Facilidad de uso para docentes y estudiantes",
        "Estabilidad de la plataforma",
        "Impacto en el aprendizaje de los estudiantes",
        "Soporte y acompañamiento de Ignite",
    ]
    scale_five_headings = "".join(f'<th scope="col">{value}</th>' for value in range(1, 6))

    def radio_cells(name, row_label, values):
        return "".join(
            f'<td><input type="radio" name="{name}" value="{value}" aria-label="{row_label}: {value}"></td>'
            for value in values
        )

    satisfaction_title = f"En general, ¿qué tan satisfecho/a estás con {title}?"
    satisfaction_table = (
        f'<div class="tw" tabindex="0" role="region" aria-label="Satisfacción general con {title}"><table class="grid">'
        f'<thead><tr><th class="first" scope="col">Valoración</th>{scale_five_headings}</tr></thead>'
        f'<tbody><tr><th scope="row">Satisfacción general</th>{radio_cells(survey["satisfaction_name"], "Satisfacción general", range(1, 6))}</tr></tbody>'
        '</table></div>'
    )
    aspect_rows = "".join(
        f'<tr><th scope="row">{label}</th>{radio_cells(name, label, range(1, 6))}</tr>'
        for name, label in zip(survey["aspect_names"], aspect_labels)
    )
    aspects_table = (
        f'<div class="tw" tabindex="0" role="region" aria-label="Aspectos de {title}"><table class="grid">'
        f'<thead><tr><th class="first" scope="col">Aspecto</th>{scale_five_headings}</tr></thead>'
        f'<tbody>{aspect_rows}</tbody></table></div>'
    )
    achievement_options = "".join(
        f'<label class="opt"><input type="checkbox" name="{survey["achievement_name"]}" value="{option}"><span>{option}</span></label>'
        for option in survey["achievements"]
    )
    recommendation_values = list(range(0, 11))
    recommendation_headings = "".join(f'<th scope="col">{value}</th>' for value in recommendation_values)
    recommendation_table = (
        '<div class="tw" tabindex="0" role="region" aria-label="Probabilidad de recomendación"><table class="grid">'
        f'<thead><tr><th class="first" scope="col">Valoración</th>{recommendation_headings}</tr></thead>'
        f'<tbody><tr><th scope="row">Probabilidad de recomendar</th>{radio_cells(survey["recommendation_name"], "Probabilidad de recomendar", recommendation_values)}</tr></tbody>'
        '</table></div>'
    )
    plan_options = "".join(
        f'<label class="opt"><input type="radio" name="{survey["plan_name"]}" value="{option}"><span>{option}</span></label>'
        for option in ("Continuar igual", "Continuar y ampliar a otros programas o sedes", "Aún no está definido", "No continuar")
    )
    if key == "4prot":
        case_yes = (
            f'<label class="opt"><input type="radio" name="{survey["case_name"]}" value="Sí, contáctenme. (usaremos el email registrado)">'
            '<span>Sí, contáctenme. (usaremos el email registrado)</span></label>'
        )
        case_contact = ""
    else:
        case_yes = (
            f'<label class="opt"><input type="radio" name="{survey["case_name"]}" value="Sí, contáctenme" data-other="cloudlabs-case-email">'
            '<span>Sí, contáctenme. Correo:</span></label>'
        )
        case_contact = (
            '<label class="other" id="cloudlabs-case-email" hidden><span>Correo (obligatorio)</span>'
            '<input type="email" name="c70-correo" autocomplete="email" disabled required></label>'
        )

    markup = f"""
    <section>
      <div class="q"><div class="q-head"><span class="code">4.1</span><h4>{satisfaction_title}</h4></div>
        <p class="hint">1 · Muy insatisfecho · 5 · Muy satisfecho.</p>{satisfaction_table}</div>
      <div class="q"><div class="q-head"><span class="code">4.2</span><h4>Califica de 1 a 5 cada aspecto de {title}</h4></div>
        <p class="hint">1 = Muy malo · 5 = Excelente.</p>{aspects_table}</div>
      <div class="q"><div class="q-head"><span class="code">4.3</span><h4>¿Qué ha logrado {title} en tus cursos?</h4></div>
        <p class="hint">Selección múltiple.</p><div class="opts" data-group>{achievement_options}</div></div>
      <div class="q"><div class="q-head"><span class="code">4.4</span><h4>De 0 a 10, ¿qué tan probable es que recomiendes {title} a otra institución?</h4></div>
        <p class="hint">0 = Nada probable · 10 = Totalmente probable.</p>{recommendation_table}</div>
      <div class="q"><div class="q-head"><span class="code">4.5</span><h4>¿Cuál es el plan de tu institución con {title} para el próximo periodo?</h4></div>
        <div class="opts" data-group>{plan_options}</div></div>
      <div class="q"><div class="q-head"><span class="code">4.6</span><h4>Si pudieras mejorar una sola cosa, ¿cuál sería?</h4><span class="chip-opt">Opcional</span></div>
        <textarea name="{survey["improvement_name"]}" rows="2" aria-label="Respuesta corta opcional"></textarea></div>
      <div class="q"><div class="q-head"><span class="code">4.7</span><h4>¿Te gustaría compartir tu experiencia como caso de uso?</h4></div>
        <div class="opts" data-group>{case_yes}<label class="opt"><input type="radio" name="{survey["case_name"]}" value="No por ahora"><span>No por ahora</span></label>{case_contact}</div></div>
    </section>
    """
    section = html.fromstring(markup)
    return [
        {"code": question_code(question), "html": clean_question(question, f"product.{key}")}
        for question in section.xpath('./div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    ]


products = {}
experience = doc.xpath('//section[@id="experiencia"]')[0]
changed_products = {
    product.get("data-block"): product
    for product in product_changes_doc.xpath('.//details[contains(concat(" ", normalize-space(@class), " "), " product ")]')
}
database_product_aliases = {"ebsco", "eds", "digitalia", "sage"}
for product in experience.xpath('.//details[contains(concat(" ", normalize-space(@class), " "), " product ")]'):
    key = product.get("data-block")
    if key == "bd":
        continue
    original_title_nodes = product.xpath('.//span[contains(concat(" ", normalize-space(@class), " "), " pname ")][1]')
    original_title = " ".join(original_title_nodes[0].text_content().split()) if original_title_nodes else key
    changed_product = key in changed_products or key in database_product_aliases
    if key in database_product_aliases:
        product = copy.deepcopy(changed_products["tf"])
        replace_text(product, "Taylor & Francis", original_title)
    else:
        product = changed_products.get(key, product)
    title_nodes = product.xpath('.//span[contains(concat(" ", normalize-space(@class), " "), " pname ")][1]')
    title = " ".join(title_nodes[0].text_content().split()) if title_nodes else key
    if key in LEARNING_PRODUCT_SURVEYS:
        products[key] = {
            "title": LEARNING_PRODUCT_SURVEYS[key]["title"],
            "questions": learning_product_questions(key),
        }
        continue
    questions = product.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    if key == "koha" and questions:
        rewrite_koha_results(questions[0])
    if key == "dspace" and questions:
        rewrite_dspace_results(questions[0])
    if key == "eds" and questions:
        rewrite_eds_experience(questions[0])
        rewrite_eds_improvement(questions[1])
        questions = [questions[0], questions[1], questions[-1]]
    if key == "myloft":
        if questions:
            rewrite_myloft_experience(questions[0])
        questions = [
            question
            for question in questions
            if "Desde que su institución empezó a utilizar MyLOFT, ¿cómo considera que ha cambiado el uso de los recursos digitales?"
            not in normalized(question.text_content())
        ]
    cleaned_questions = [{"code": question_code(q), "html": clean_question(q, f"product.{key}")} for q in questions]
    if not changed_product:
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

support_questions = [
    question
    for question in section_questions("soporte", "support")
    if question["code"] not in {"2C", "2F", "2H"}
]

bank = {
    "products": products,
    "commercial": section_questions("renovacion", "commercial"),
    "support": support_questions,
    "communication": section_questions("comunicacion", "communication"),
    "priorities": priority_questions_2027(),
    "learning_priorities": learning_priority_questions_2027(),
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
    "other_solution.name": "¿Qué producto o servicio tiene con nosotros?",
    "consent.anonymous_study": "Autorización para usar respuestas de forma anónima y agregada en un estudio regional sobre las necesidades de las bibliotecas en 2027",
    # Encabezados legibles para respuestas de la versión anterior de Koha que
    # ya pueden estar almacenadas en la base de datos.
    "bank.product.koha.m8-1": "Koha · K2 · Estabilidad y velocidad de la plataforma",
    "bank.product.koha.m8-2": "Koha · K2 · Facilidad de uso de los módulos utilizados por el equipo",
    "bank.product.koha.m8-3": "Koha · K2 · Facilidad de uso del catálogo en línea (OPAC) para los usuarios",
    "bank.product.koha.o10": "Koha · K4 · ¿En qué medida ayudó a cumplir los objetivos de 2026?",
    "bank.product.koha.t11": "Koha · K5 · Motivo principal de la valoración sobre el cumplimiento de objetivos",
    "bank.product.koha.o12": "Koha · K6 · Mejoras más útiles para la biblioteca en 2027",
    "bank.product.koha.o15": "Koha · K9 · Plan de la institución para el próximo periodo",
    "bank.product.koha.t16": "Koha · K10 · Si pudiera mejorar una sola cosa, ¿cuál sería?",
    "bank.product.koha.c17": "Koha · K11 · ¿Le gustaría compartir su experiencia como caso de uso?",
    "bank.product.koha.c17-correo": "Koha · K11 · Correo para seguimiento del caso de uso",
    # Matriz de Koha sustituida en esta revisión. Las nuevas respuestas usan
    # koha-results-2026-1 a koha-results-2026-5.
    "bank.product.koha.m7-1": "Koha — Matriz anterior · Satisfacción general",
    "bank.product.koha.m7-2": "Koha — Matriz anterior · Mejoras e innovaciones útiles durante 2026",
    "bank.product.koha.m7-3": "Koha — Matriz anterior · Rapidez y continuidad en horas de alto uso",
    "bank.product.koha.m7-4": "Koha — Matriz anterior · Claridad y utilidad de las actualizaciones",
    "bank.product.koha.m7-5": "Koha — Matriz anterior · Autonomía después de las capacitaciones",
    "bank.product.koha.m7-6": "Koha — Matriz anterior · Catalogación con MARC 21, RDA y encabezamientos normalizados",
    "bank.product.koha.m7-7": "Koha — Matriz anterior · Renovaciones, reservas y avisos sin acudir al mostrador",
    "bank.product.koha.m7-8": "Koha — Matriz anterior · Demostración del costo por uso",
    "bank.product.koha.m7-9": "Koha — Matriz anterior · Alertas de suscripciones y números faltantes",
    "bank.product.koha.m7-10": "Koha — Matriz anterior · Experiencia de búsqueda del catálogo",
    "bank.product.koha.m7-11": "Koha — Matriz anterior · Reportes para decisiones y presentación de resultados",
    # Matriz de DSpace sustituida en esta revisión. Las nuevas respuestas usan
    # dspace-2026-1 a dspace-2026-5.
    "bank.product.dspace.m22-1": "DSpace — Matriz anterior · Satisfacción general",
    "bank.product.dspace.m22-2": "DSpace — Matriz anterior · Mejoras e innovaciones durante 2026",
    "bank.product.dspace.m22-3": "DSpace — Matriz anterior · Estabilidad y agilidad del repositorio",
    "bank.product.dspace.m22-4": "DSpace — Matriz anterior · Gestión de perfiles, proyectos y financiamiento",
    "bank.product.dspace.m22-5": "DSpace — Matriz anterior · Uso de identificadores persistentes",
    "bank.product.dspace.m22-6": "DSpace — Matriz anterior · Recolección por redes internacionales",
    "bank.product.dspace.m22-7": "DSpace — Matriz anterior · Datos de investigación y principios FAIR",
    "bank.product.dspace.m22-8": "DSpace — Matriz anterior · Política de preservación digital",
    "bank.product.dspace.m22-9": "DSpace — Matriz anterior · Accesibilidad y experiencia de usuario",
    "bank.product.dspace.m22-10": "DSpace — Matriz anterior · Métricas de impacto y visibilidad",
    "bank.product.dspace.m22-11": "DSpace — Matriz anterior · Inteligencia artificial aplicada al repositorio",
    "bank.product.dspace.m22-12": "DSpace — Matriz anterior · Versión reciente y actualizada",
    # Claves históricas de la matriz anterior de MyLOFT. La nueva versión usa
    # myloft-2026-1 a myloft-2026-5 para no mezclar respuestas entre versiones.
    "bank.product.myloft.m36-1": "MyLOFT — Matriz anterior · Satisfacción general",
    "bank.product.myloft.m36-2": "MyLOFT — Matriz anterior · Mejoras e innovaciones útiles durante 2026",
    "bank.product.myloft.m36-3": "MyLOFT — Matriz anterior · Implementación o migración ordenada y en los plazos acordados",
    "bank.product.myloft.m36-4": "MyLOFT — Matriz anterior · Solución acorde al impacto del problema",
    "bank.product.myloft.m36-5": "MyLOFT — Matriz anterior · Acceso de usuarios dentro y fuera del campus",
    "bank.product.myloft.m36-6": "MyLOFT — Matriz anterior · Menos problemas de acceso que en años anteriores",
    "bank.product.myloft.m36-7": "MyLOFT — Matriz anterior · Claridad y utilidad de las capacitaciones",
    "bank.product.myloft.m36-8": "MyLOFT — Matriz anterior · Claridad de los manuales y guías",
    "bank.product.myloft.m36-9": "MyLOFT — Matriz anterior · Autonomía para agregar recursos",
    "bank.product.myloft.m36-10": "MyLOFT — Matriz anterior · Autonomía para invitar usuarios",
    "bank.product.myloft.m36-11": "MyLOFT — Matriz anterior · Consulta de usuarios creados",
    "bank.product.myloft.m36-12": "MyLOFT — Matriz anterior · Identificación del uso por usuario o categoría",
    "bank.product.myloft.m36-13": "MyLOFT — Matriz anterior · Personalización de logos o imágenes",
    "bank.product.myloft.o38": "MyLOFT — Pregunta eliminada · Cambio percibido en el uso de los recursos digitales",
    # Respuestas históricas de las dos tablas que antes aparecían como 3.2 y
    # 3.3. Las claves nuevas usan "support-merged" y no alteran estos datos.
    "bank.support.m152-1": "Soporte y acompañamiento — Pregunta anterior 3.2 · Primera respuesta y resolución en el plazo requerido",
    "bank.support.m152-2": "Soporte y acompañamiento — Pregunta anterior 3.2 · Comprensión del impacto, información del avance y explicación de la solución",
    "bank.support.m152-4": "Soporte y acompañamiento — Pregunta anterior 3.2 · Cordialidad y respeto",
    "bank.support.m152-5": "Soporte y acompañamiento — Pregunta anterior 3.2 · Coordinación con el área de TI",
    "bank.support.m152-6": "Soporte y acompañamiento — Pregunta anterior 3.2 · Los problemas no volvieron a presentarse",
    "bank.support.m152-7": "Soporte y acompañamiento — Pregunta anterior 3.2 · Facilidad para reportar en la Mesa de Servicio",
    "bank.support.m152-9": "Soporte y acompañamiento — Pregunta anterior 3.2 · Satisfacción general con soporte",
    "bank.support.m9-1": "Soporte y acompañamiento — Pregunta anterior 3.3 · Aprendizaje en las capacitaciones",
    "bank.support.m9-2": "Soporte y acompañamiento — Pregunta anterior 3.3 · Reuniones de seguimiento productivas",
    "bank.support.m9-3": "Soporte y acompañamiento — Pregunta anterior 3.3 · Claridad y cumplimiento del plan de acción",
    "bank.support.m9-4": "Soporte y acompañamiento — Pregunta anterior 3.3 · Conocimiento del Club de Miembros",
    "bank.support.m9-5": "Soporte y acompañamiento — Pregunta anterior 3.3 · Transformación tecnológica de la unidad",
    "bank.support.m9-6": "Soporte y acompañamiento — Pregunta anterior 3.3 · Acompañamiento de expertos para alcanzar objetivos",
    "bank.support.m9-7": "Soporte y acompañamiento — Pregunta anterior 3.3 · Desarrollo de habilidades para la labor",
    "bank.support.m9-8": "Soporte y acompañamiento — Pregunta anterior 3.3 · Retorno de la inversión",
    # Encabezados legibles para respuestas históricas de las antiguas
    # preguntas 3.6 y 3.7, consolidadas ahora en una sola pregunta 3.6.
    "bank.support.o157-otro": "Soporte y acompañamiento — Pregunta anterior 3.6 · Otra pregunta especificada",
    "bank.support.m10-1": "Soporte y acompañamiento — Pregunta anterior 3.7 · Uso de los informes — Sustentar decisiones de presupuesto",
    "bank.support.m10-2": "Soporte y acompañamiento — Pregunta anterior 3.7 · Uso de los informes — Comunicar los resultados de la biblioteca",
    "bank.support.m10-3": "Soporte y acompañamiento — Pregunta anterior 3.7 · Uso de los informes — Documentar evidencias institucionales",
    "bank.support.m10-4": "Soporte y acompañamiento — Pregunta anterior 3.7 · Uso de los informes — Orientar la formación y la difusión",
    "bank.support.m10-5": "Soporte y acompañamiento — Pregunta anterior 3.7 · Uso de los informes — Evaluar las acciones de formación y difusión",
    "bank.support.m10-6": "Soporte y acompañamiento — Pregunta anterior 3.7 · Uso de los informes — Dar seguimiento a las metas de uso",
}
for product in products.values():
    labels.update(control_labels(product["questions"], product["title"]))
labels.update(control_labels(bank["commercial"], "Asesoría y acompañamiento comercial"))
labels.update(control_labels(bank["support"], "Soporte y acompañamiento"))
labels.update(control_labels(bank["communication"], "Marketing y comunicación"))
labels.update(control_labels(bank["priorities"], "Prioridades para 2027"))
labels.update(control_labels(bank["learning_priorities"], "Prioridades para 2027 · 4PROT y CloudLabs"))

OUTPUT.write_text(
    "// Generated from Encuesta_Ignite_2026_v2.html, Encuesta_Ignite_2026_cambios.html and Encuesta_Ignite_2026_cambios_productos.html. Do not edit question text here.\n"
    "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
LABELS_OUTPUT.write_text(json.dumps(labels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {OUTPUT} with {sum(len(v['questions']) for v in products.values())} product questions")
