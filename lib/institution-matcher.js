const INSTITUTION_STOPWORDS = new Set(['universidad', 'de', 'del', 'la', 'el', 'y', 'en']);
const DEFAULT_ALIASES = [
  ['CRAI P. Florentino Idoate, S.J.', 'Universidad Centroamericana José Simeón Cañas (UCA)'],
  ['Universidad Autónoma de San Luis Potosí Sistema de Bibliotecas', 'Universidad Autónoma de San Luis Potosí UASLP Ing. en Materiales'],
  ['UNITEC-HONDURAS', 'UNITEC'],
  ['Corporación Universitaria Unilasallista', 'Corporación Universitaria Lasallista'],
  ['Universidad Nacional Costa Rica', 'Universidad Nacional de Costa Rica (UNA)']
];

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function comparableInstitutionName(value) {
  return normalized(String(value || '').replace(/\([^)]*\)/g, ' '));
}

function significantInstitutionTokens(value) {
  return new Set(comparableInstitutionName(value).split(' ').filter((token) => token && !INSTITUTION_STOPWORDS.has(token)));
}

function institutionTokenScore(left, right) {
  const leftTokens = significantInstitutionTokens(left);
  const rightTokens = significantInstitutionTokens(right);
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return { shared, score: shared / Math.max(leftTokens.size, rightTokens.size, 1) };
}

function createInstitutionMatcher(targetInstitutions, aliases = DEFAULT_ALIASES) {
  const targetInstitutionByKey = new Map(targetInstitutions.map((institution) => [normalized(institution.name), institution]));
  const aliasTargets = new Map(aliases.map(([alias, target]) => [normalized(alias), normalized(target)]));

  return function matchTargetInstitution(value) {
    const rawKey = normalized(value);
    if (!rawKey) return null;
    const exact = targetInstitutionByKey.get(rawKey);
    if (exact) return exact;
    const aliasTarget = aliasTargets.get(rawKey);
    if (aliasTarget) return targetInstitutionByKey.get(aliasTarget) || null;

    const comparable = comparableInstitutionName(value);
    const comparableMatches = targetInstitutions.filter((institution) => comparableInstitutionName(institution.name) === comparable);
    if (comparableMatches.length === 1) return comparableMatches[0];

    const containedMatches = targetInstitutions.filter((institution) => {
      const targetComparable = comparableInstitutionName(institution.name);
      return comparable.length >= 12 && (targetComparable.includes(comparable) || comparable.includes(targetComparable));
    });
    if (containedMatches.length === 1) return containedMatches[0];

    const ranked = targetInstitutions
      .map((institution) => ({ institution, ...institutionTokenScore(value, institution.name) }))
      .filter(({ shared, score }) => shared >= 2 && score >= 0.80)
      .sort((a, b) => b.score - a.score || b.shared - a.shared);
    if (!ranked.length) return null;
    if (ranked[1] && ranked[0].score === ranked[1].score && ranked[0].shared === ranked[1].shared) return null;
    return ranked[0].institution;
  };
}

module.exports = { normalized, createInstitutionMatcher };
