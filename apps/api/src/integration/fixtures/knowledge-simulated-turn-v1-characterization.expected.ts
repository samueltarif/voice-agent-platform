/**
 * Caracterização do turno simulado v1 (PR B1 / DEC-067): resultado EXATO do
 * caminho de um agente PUBLICADO (`knowledge.search` + resposta fixa) na `main`
 * `c31cd4a`, gerado antes de mudar o fluxo compartilhado. Formato:
 * `outcome|sha256(linhas fixas da resposta, sem as citações "[n]")[0..16]|nº de evidências|termos`.
 * Não editar à mão.
 */
export const V1_TURN_CHARACTERIZATION: Readonly<Record<string, string>> = {
  P01: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  P02: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  P03: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  P04: 'ANSWERED_WITH_EVIDENCE|3c96efbeefc2597d|1|serve,comandar',
  P05: 'ANSWERED_WITH_EVIDENCE|e041e3c907cb5d23|3|calibrar',
  P06: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  P07: 'ANSWERED_WITH_EVIDENCE|80a308e921f647e4|3|usar',
  P08: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|2|',
  P09: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|2|',
  P10: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|1|',
  P11: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  P13: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  P14: 'ANSWERED_WITH_EVIDENCE|b7dad53bf223d308|2|desmontar',
  P12: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|2|',
  C01: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  C02: 'ANSWERED_WITH_EVIDENCE|050777ee3c2235d6|3|qt310',
  C03: 'ANSWERED_WITH_EVIDENCE|82c635ce14cbd149|2|serve',
  C04: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  C05: 'NO_EVIDENCE|b7621953d8ca0ecf|0|999',
  C06: 'ANSWERED_WITH_EVIDENCE|dd88238f46382f22|3|2000',
  C07: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  M01: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  M02: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  M03: 'ANSWERED_WITH_EVIDENCE|8aa097c1d1025542|3|',
  M04: 'ANSWERED_WITH_EVIDENCE|8aa097c1d1025542|3|',
  M05: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  M06: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  N01: 'NO_EVIDENCE|06a3df29b106bbc4|0|helicoptero',
  N02: 'ANSWERED_WITH_EVIDENCE|1652a238c69dd0ea|2|medidor,ultrassonico',
  N03: 'ANSWERED_WITH_EVIDENCE|4ffdd093bb809b4d|2|submersa,poco',
  N04: 'NO_EVIDENCE|3d67d97844aef3d6|0|manutencao,condicionado',
  N05: 'ANSWERED_WITH_EVIDENCE|4cab25fee262ae16|3|umidade',
  I01: 'NO_EVIDENCE|6fdddaffe86a7af5|0|transmissor,pressao',
  I02: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|1|',
  I03: 'NO_EVIDENCE|cae12299269e9a32|0|helicoptero,125',
  I04: 'ANSWERED_WITH_EVIDENCE|8d465a056e256ebf|2|mes',
  H01: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  H02: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
  H03: 'ANSWERED_WITH_EVIDENCE|616efdaca458ca21|3|',
};
