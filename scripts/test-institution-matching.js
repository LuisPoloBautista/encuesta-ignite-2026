const assert = require('node:assert/strict');
const institutions = require('../config/institutions.json');
const { createInstitutionMatcher } = require('../lib/institution-matcher');
const matchTargetInstitution = createInstitutionMatcher(institutions);

const cases = new Map([
  ['Universidad Tecnológica de El Salvador', 'Universidad Tecnológica de El Salvador'],
  ['Universidad Hispanoamericana', 'Universidad Hispanoamericana (UH)'],
  ['CRAI P. Florentino Idoate, S.J.', 'Universidad Centroamericana José Simeón Cañas (UCA)'],
  ['Universidad Fidélitas', 'Universidad Fidélitas'],
  ['Universidad Autónoma de San Luis Potosí Sistema de Bibliotecas', 'Universidad Autónoma de San Luis Potosí UASLP Ing. en Materiales'],
  ['Universidad Autónoma de San Luis Potosí', 'Universidad Autónoma de San Luis Potosí UASLP Ing. en Materiales'],
  ['UNITEC-HONDURAS', 'UNITEC'],
  ['Universidad El Bosque', 'Universidad El Bosque'],
  ['Universidad de El Salvador', 'Universidad de El Salvador (UES)'],
  ['Corporación Universitaria Unilasallista', 'Corporación Universitaria Lasallista'],
  ['Universidad de Panamà', 'Universidad de Panamá (UP)'],
  ['Universidad Gerardo Barrios', 'Universidad Gerardo Barrios'],
  ['Centro de Ingeniería y Desarrollo Industrial', 'Centro de Ingeniería y Desarrollo Industrial CIDESI'],
  ['Universidad Marìtima Internacional de Panamà', 'Universidad Marítima Internacional de Panamá (UMIP)'],
  ['Universidad Nacional Costa Rica', 'Universidad Nacional de Costa Rica (UNA)']
]);

cases.forEach((expected, submitted) => {
  assert.equal(matchTargetInstitution(submitted)?.name, expected, `No se concilió: ${submitted}`);
});

assert.notEqual(
  matchTargetInstitution('Universidad Tecnológica de El Salvador')?.name,
  matchTargetInstitution('Universidad de El Salvador')?.name,
  'Las dos instituciones de El Salvador deben conservarse separadas.'
);

assert.equal(matchTargetInstitution('Institución nueva sin registrar'), null);
console.log(`Conciliación de instituciones: ${cases.size} variantes verificadas.`);
