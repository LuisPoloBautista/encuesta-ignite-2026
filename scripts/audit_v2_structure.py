from pathlib import Path
from lxml import html

root = Path(__file__).resolve().parents[1]
doc = html.fromstring((root / "Encuesta_Ignite_2026_v2.html").read_text(encoding="utf-8"))


def has_class(node, name):
    return name in (node.get("class") or "").split()


def first_text(node, class_name):
    found = [item for item in node.iter() if has_class(item, class_name)]
    return " ".join(found[0].text_content().split()) if found else ""


for section in doc.xpath("//section[@id]"):
    direct_codes = []
    for question in [item for item in section.iter("div") if has_class(item, "q")]:
        if any(has_class(parent, "product") for parent in question.iterancestors("details")):
            continue
        direct_codes.append(first_text(question, "code"))
    print(f"{section.get('id')}: {first_text(section, 'stitle')} | {', '.join(direct_codes)}")

experience = doc.get_element_by_id("experiencia")
print("\nProductos:")
for product in [item for item in experience.iter("details") if has_class(item, "product")]:
    questions = [item for item in product.iter("div") if has_class(item, "q")]
    print(f"{product.get('data-block')}: {first_text(product, 'pname')} | {', '.join(first_text(q, 'code') for q in questions)}")

print("\nControles por pregunta:")
for question in [item for item in experience.iter("div") if has_class(item, "q")]:
    names = list(dict.fromkeys(control.get("name") for control in question.xpath('.//*[@name]')))
    print(f"{first_text(question, 'code')}: {', '.join(name for name in names if name)}")

print("\nReglas configuradas:")
for question in [item for item in doc.iter("div") if has_class(item, "q")]:
    configs = [item for item in question.iter("div") if has_class(item, "cfg")]
    if configs:
        rule = " ".join(configs[0].text_content().split())
        names = list(dict.fromkeys(control.get("name") for control in question.xpath('.//*[@name]')))
        print(f"{first_text(question, 'code')} [{', '.join(name for name in names if name)}]: {rule}")
