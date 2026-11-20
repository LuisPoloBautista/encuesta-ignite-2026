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


def rewrite_support_incident_statements(node):
    report_statement = "Nos resultó fácil reportar una incidencia a Ignite"
    consolidated_statement = (
        "Soporte entendió cómo nos afectó la incidencia, nos informó del avance sin que lo "
        "pidiéramos y explicó claramente qué pasó y cómo lo resolvió"
    )
    statements_to_remove = {
        "El equipo de soporte entendió nuestra necesidad antes de proponer una solución y nos informó sobre el avance de los casos sin tener que pedirlo",
        "El equipo de soporte tuvo en cuenta cómo la incidencia afectaba el trabajo de nuestra institución",
    }

    for row in list(node.xpath('.//table/tbody/tr[th]')):
        headings = row.xpath('./th[1]')
        if not headings:
            continue
        heading = headings[0]
        statement = normalized(heading.text_content()).rstrip(".")
        if statement == report_statement:
            heading.clear()
            heading.set("scope", "row")
            heading.text = "Nos resultó fácil reportar una incidencia en la Mesa de servicio"
        elif statement == "Entendimos qué ocurrió y qué se hizo para resolverlo":
            heading.clear()
            heading.set("scope", "row")
            heading.text = consolidated_statement
        elif statement in statements_to_remove:
            row.getparent().remove(row)


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
        rewrite_support_incident_statements(node)
    if scope == "support" and code == "2C":
        rewrite_support_agreement_scale(node)
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
    <div class="q-head"><span class="code">5.1</span><h4>¿Cuáles son los TRES desafíos más importantes para su biblioteca en 2027? (seleccione tres)</h4></div>
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
    questions = product.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    if key == "eds" and questions:
        rewrite_eds_experience(questions[0])
        rewrite_eds_improvement(questions[1])
        questions = [questions[0], questions[1], questions[-1]]
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

support_questions = [question for question in section_questions("soporte", "support") if question["code"] != "2F"]

bank = {
    "products": products,
    "commercial": section_questions("renovacion", "commercial"),
    "support": support_questions,
    "communication": section_questions("comunicacion", "communication"),
    "priorities": priority_questions_2027(),
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
}
for product in products.values():
    labels.update(control_labels(product["questions"], product["title"]))
labels.update(control_labels(bank["commercial"], "Asesoría y acompañamiento comercial"))
labels.update(control_labels(bank["support"], "Soporte y acompañamiento"))
labels.update(control_labels(bank["communication"], "Marketing y comunicación"))
labels.update(control_labels(bank["priorities"], "Prioridades para 2027"))

OUTPUT.write_text(
    "// Generated from Encuesta_Ignite_2026_v2.html, Encuesta_Ignite_2026_cambios.html and Encuesta_Ignite_2026_cambios_productos.html. Do not edit question text here.\n"
    "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
LABELS_OUTPUT.write_text(json.dumps(labels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {OUTPUT} with {sum(len(v['questions']) for v in products.values())} product questions")
