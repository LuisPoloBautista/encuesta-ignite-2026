import copy
import json
from pathlib import Path

from lxml import html

ROOT = Path(__file__).resolve().parents[1]


def load_bank():
    source = (ROOT / "public" / "question-bank.js").read_text(encoding="utf-8")
    return json.loads(source.split("=", 1)[1].strip().removesuffix(";"))


def question(bank, section, code):
    return next(item for item in bank[section] if item["code"] == code)


def fragment(item):
    return html.fragment_fromstring(item["html"])


bank = load_bank()
app = (ROOT / "public" / "app.js").read_text(encoding="utf-8")
index = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
admin = (ROOT / "public" / "admin.html").read_text(encoding="utf-8")
styles = (ROOT / "public" / "styles.css").read_text(encoding="utf-8")
server = (ROOT / "server.js").read_text(encoding="utf-8")
institutions = json.loads((ROOT / "config" / "institutions.json").read_text(encoding="utf-8"))

assert len(institutions) == 59
assert sum(item["territory"] == "México" for item in institutions) == 20
assert sum(item["territory"] == "Centro y Sudamérica" for item in institutions) == 39
assert next(item for item in institutions if item["name"].startswith("Universidad Gerardo Barrios"))["country"] == "El Salvador"
assert next(item for item in institutions if item["name"].startswith("Fundación Universitaria del Área Andina"))["country"] == "Colombia"
assert "const COVERAGE_GOAL = 0.90" in server

commercial_1a = fragment(question(bank, "commercial", "1A"))
assert not commercial_1a.xpath('.//input[@value="6" or @value="7"]')
commercial_1b = fragment(question(bank, "commercial", "1B"))
assert commercial_1b.xpath('string(.//*[@data-max][1]/@data-max)') == "2"
assert commercial_1b.xpath('.//*[@data-other]') and commercial_1b.xpath('.//input[@required]')
commercial_1c = fragment(question(bank, "commercial", "1C"))
commercial_1c_text = " ".join(commercial_1c.text_content().split())
for expected in ("IG Publishing con IA", "Cursos especializados", "Learning Space"):
    assert expected in commercial_1c_text
product_interest_names = {
    " ".join(node.text_content().split())
    for node in commercial_1c.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " prodname ")]')
}
assert {"IG Publishing con IA", "Cursos especializados", "Learning Space"} <= product_interest_names
assert len(commercial_1c.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " prodname ")]')) >= 14
assert ".bank-content .prodname" in styles
commercial_1f = fragment(question(bank, "commercial", "1F"))
assert commercial_1f.xpath('.//input[@type="checkbox"]')
assert not commercial_1f.xpath('.//*[@data-max]')

expected_products = {
    "4prot": "4PROT", "cloudlabs": "CloudLabs", "digitalia": "Digitalia",
    "dspace": "DSpace", "ebsco": "EBSCO", "eds": "EDS (EBSCO Discovery Service)",
    "ig": "IG Publishing", "koha": "Koha", "lemb": "LEMB", "myloft": "MyLOFT",
    "odilo": "Odilo", "ojs": "OJS", "web": "Página web", "sage": "Sage",
    "scintra": "Scintra", "servidores": "Servidores", "marketing": "Smith Marketing",
    "soporte": "Soporte", "tf": "Taylor & Francis", "winkel": "Winkel",
}
for key, title in expected_products.items():
    product = bank["products"][key]
    assert product["title"] == title
    assert "problema principal" in fragment(product["questions"][1]).text_content().lower(), key

assert "bd" not in bank["products"]
product_changes = html.fromstring((ROOT / "Encuesta_Ignite_2026_cambios_productos.html").read_text(encoding="utf-8"))
changed_counts = {
    "koha": 8, "lemb": 7, "dspace": 8, "ojs": 6, "myloft": 7,
    "winkel": 5, "web": 4, "servidores": 5, "4prot": 7, "cloudlabs": 7,
    "tf": 5, "odilo": 3, "ig": 5, "marketing": 8,
}
for key, count in changed_counts.items():
    source_product = product_changes.xpath(f'.//details[@data-block="{key}"]')[0]
    source_questions = source_product.xpath('.//div[contains(concat(" ", normalize-space(@class), " "), " q ")]')
    generated_questions = bank["products"][key]["questions"]
    assert len(source_questions) == len(generated_questions) == count, key
    for source_question, generated_question in zip(source_questions, generated_questions):
        source_copy = copy.deepcopy(source_question)
        optional = bool(source_copy.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " chip-opt ")]'))
        for unwanted in source_copy.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " cfg ") or contains(concat(" ", normalize-space(@class), " "), " chips ") or contains(concat(" ", normalize-space(@class), " "), " antes ") or contains(concat(" ", normalize-space(@class), " "), " pill ")]'):
            unwanted.getparent().remove(unwanted)
        generated_fragment = fragment(generated_question)
        assert " ".join(source_copy.text_content().split()) == " ".join(generated_fragment.text_content().split()), (key, generated_question["code"])
        if optional:
            assert not generated_fragment.xpath('.//*[@required and not(ancestor::*[contains(concat(" ", normalize-space(@class), " "), " other ")])]'), (key, generated_question["code"])

for key in ("ebsco", "eds", "digitalia", "sage", "tf"):
    assert len(bank["products"][key]["questions"]) == 5
for key in ("ebsco", "eds", "digitalia", "sage"):
    product_text = " ".join(fragment(item).text_content() for item in bank["products"][key]["questions"])
    assert "Taylor & Francis" not in product_text

for key in ("koha", "dspace", "marketing"):
    reason = fragment(next(item for item in bank["products"][key]["questions"] if item["code"] == "4.4"))
    if key == "koha":
        assert reason.xpath('.//textarea[@required]')
    if key == "dspace":
        assert not reason.xpath('.//textarea[@required]')

support_codes = {item["code"] for item in bank["support"]}
assert "2F" not in support_codes
assert not any("problema principal" in item["html"].lower() for item in bank["support"])
support_2a = fragment(question(bank, "support", "2A"))
assert "¿Reportó algún ticket durante 2026 desde la institución?" in support_2a.text_content()
assert set(support_2a.xpath('.//input/@value')) == {"Sí", "No", "No lo sé"}
support_2c = fragment(question(bank, "support", "2C"))
assert set(support_2c.xpath('.//input/@value')) == {
    "1 · No", "2 · Medio, puede mejorar", "3 · Completamente de acuerdo"
}
assert "Me gustaría tener los siguientes datos para la toma de decisiones que me permitan:" in question(bank, "support", "2H")["html"]

priority_codes = {item["code"] for item in bank["priorities"]}
assert priority_codes == {"4A", "5A", "5A·F", "5B", "5C", "5D"}
assert len(fragment(question(bank, "priorities", "5A")).xpath('.//select')) == 4
assert fragment(question(bank, "priorities", "5A")).xpath('.//input[@name="g12-otro" and @required]')
assert len(fragment(question(bank, "priorities", "5A·F")).xpath('.//select')) == 3
assert fragment(question(bank, "priorities", "5C")).xpath('.//textarea')
assert "¿Qué tecnología, herramienta o producto sería ideal para su institución y le gustaría que hiciera parte del portafolio de Ignite?" in question(bank, "priorities", "5D")["html"]

for section in ("commercial", "products", "support", "communication", "priorities"):
    entries = bank[section].values() if section == "products" else bank[section]
    for entry in entries:
        questions = entry["questions"] if section == "products" else [entry]
        for item in questions:
            root = fragment(item)
            for table in root.xpath('.//table'):
                headers = [" ".join(node.text_content().split()) for node in table.xpath('./thead/tr[1]/th')]
                numeric = [value for value in headers if value[:1] in "12345"]
                if len(numeric) >= 5 and [value[:1] for value in numeric[:5]] == list("12345"):
                    assert all("·" not in value for value in numeric[1:4]), (section, item["code"], numeric)

assert "Tamaño de la institución (si lo sabe)" not in app
assert "Tamaño de la institución'" in app and "Opcional · número aproximado" in app
assert "🚶‍➡️" in app and "🚶‍➡️" in index
assert "Marketing Smith" not in app
assert "Marketing y comunicaciones', 'Marketing y comunicaciones'" in app
assert "Estudios y análisis internacionales sobre bibliotecas en Latinoamérica, Europa y Estados Unidos" in app
for hidden_product in ("Digitalia", "EBSCO", "EDS (EBSCO Discovery Service)", "CloudLabs", "Sage"):
    assert hidden_product in app
assert "bankQuestionsHtml(visibleCommercialQuestions(), '1')" in app
assert "'bank.product.koha.o9', 'bank.product.dspace.o24', 'bank.product.marketing.o106'" in app
assert "input[type=\"checkbox\"], input[type=\"radio\"]" in app
assert "Estudio Horizonte 2027: necesidades y prioridades de las bibliotecas Ignite LATAM" in app
assert "option.querySelector('.prodname')" in app
assert "territory-summary-body" in admin
assert "institutions.js" not in index
assert "window.IGNITE_INSTITUTIONS" not in app
assert "selectField('identity.institution_name'" not in app
assert "textField('identity.institution_name'" in app
assert not (ROOT / "public" / "institutions.json").exists()
assert not (ROOT / "public" / "institutions.js").exists()

print("Auditoría de cambios 2026: OK")
