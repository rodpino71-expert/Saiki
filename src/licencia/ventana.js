const DIAS_REVALIDACION = 7;
const DIAS_GRACIA = 14;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasTranscurridos(issuedAtMs, ahoraMs) {
  return (ahoraMs - issuedAtMs) / MS_POR_DIA;
}

function necesitaRevalidar(issuedAtMs, ahoraMs) {
  return diasTranscurridos(issuedAtMs, ahoraMs) >= DIAS_REVALIDACION;
}

function dentroDePeriodoDeGracia(issuedAtMs, ahoraMs) {
  return diasTranscurridos(issuedAtMs, ahoraMs) < DIAS_GRACIA;
}

module.exports = { DIAS_REVALIDACION, DIAS_GRACIA, necesitaRevalidar, dentroDePeriodoDeGracia };
