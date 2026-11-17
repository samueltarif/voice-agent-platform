/**
 * Caracterização da busca v1 (PR B1 / DEC-067): saída EXATA da v1 na `main`
 * `c31cd4a` para o corpus de avaliação, gerada ANTES de qualquer mudança no fluxo
 * compartilhado. A v1 precisa continuar idêntica (inclusive os defeitos conhecidos).
 * Formato: ver `knowledge-retrieval-projection.ts`. Não editar à mão.
 */
export const V1_CHARACTERIZATION: Readonly<Record<string, { retrieval: string; preview: string }>> =
  {
    P01: {
      retrieval:
        '{"hits":["CONTEXT|installation|0|0.1923|6a3974c64f2a5332","CONTEXT|installation|1|0.1423|945dfb00624a0cb9","DIRECT|calibration|0|0.3729|7ce2f066da7e3186","DIRECT|catalog|0|0.7614|6a37b9205c0760f9","DIRECT|prices|0|0.3729|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["transmissor","pressao","qualitec","oferece"],"hits":["CONTEXT|installation|0|0.1923|45bc901c2c9d9495","CONTEXT|installation|1|0.1423|8ffe82fda4bd18b6","DIRECT|calibration|0|0.3729|7ce2f066da7e3186","DIRECT|catalog|0|0.7614|8634dab40ffb0a87","DIRECT|prices|0|0.3729|393100c1cb151a05"],"unmatched":[]}',
    },
    P02: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.67|6a37b9205c0760f9","DIRECT|hostile|0|0.19|72c9d1145dce2cc0","DIRECT|installation|0|0.19|6a3974c64f2a5332"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["vendem","valvula","esfera"],"hits":["DIRECT|catalog|0|0.67|fa7ea6e40917ff62","DIRECT|hostile|0|0.19|72c9d1145dce2cc0","DIRECT|installation|0|0.19|d95d6d50ec1f5f1a"],"unmatched":[]}',
    },
    P03: {
      retrieval:
        '{"hits":["CONTEXT|calibration|0|0.2472|7ce2f066da7e3186","CONTEXT|installation|0|0.5194|6a3974c64f2a5332","CONTEXT|installation|1|0.4694|945dfb00624a0cb9","CONTEXT|prices|0|0.4694|393100c1cb151a05","DIRECT|catalog|0|1|6a37b9205c0760f9"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["transmissor","temperatura","termopar"],"hits":["CONTEXT|calibration|0|0.2472|7ce2f066da7e3186","CONTEXT|installation|0|0.5194|8c411aad256a5222","CONTEXT|installation|1|0.4694|35ec732031d388f2","CONTEXT|prices|0|0.4694|393100c1cb151a05","DIRECT|catalog|0|1|819beb407076906b"],"unmatched":[]}',
    },
    P04: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.55|6a37b9205c0760f9"],"truncated":false,"unmatched":["serve","comandar"]}',
      preview:
        '{"terms":["pressostato","serve","comandar","compressor"],"hits":["DIRECT|catalog|0|0.55|088494f11ed6e3da"],"unmatched":["serve","comandar"]}',
    },
    P05: {
      retrieval: '{"hits":[],"truncated":false,"unmatched":["calibrar"]}',
      preview: '{"terms":["calibrar","transmissor","310"],"hits":[],"unmatched":["calibrar"]}',
    },
    P06: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.4571|7ce2f066da7e3186","DIRECT|catalog|0|0.7285|6a37b9205c0760f9","DIRECT|installation|0|0.1607|6a3974c64f2a5332"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["fazem","calibracao","certificado","rbc"],"hits":["DIRECT|calibration|0|0.4571|7ce2f066da7e3186","DIRECT|catalog|0|0.7285|5af17dac1b0e2d28","DIRECT|installation|0|0.1607|c2eb9d54749c84cb"],"unmatched":[]}',
    },
    P07: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.8|6a37b9205c0760f9","DIRECT|hostile|0|0.15|72c9d1145dce2cc0","DIRECT|installation|0|0.15|6a3974c64f2a5332"],"truncated":false,"unmatched":["usar"]}',
      preview:
        '{"terms":["valvula","usar","rede","incendio"],"hits":["DIRECT|catalog|0|0.8|1dda29fa5510df48","DIRECT|hostile|0|0.15|72c9d1145dce2cc0","DIRECT|installation|0|0.15|d95d6d50ec1f5f1a"],"unmatched":["usar"]}',
    },
    P08: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.95|6a37b9205c0760f9","DIRECT|installation|0|0.2179|6a3974c64f2a5332"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["manometro","glicerina","vibracao"],"hits":["DIRECT|catalog|0|0.95|c7fcd620b5fed714","DIRECT|installation|0|0.2179|9069480b8dac91dc"],"unmatched":[]}',
    },
    P09: {
      retrieval: '{"hits":["DIRECT|faq|0|0.85|21ba9cfbcb828ce7"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["prazo","entrega"],"hits":["DIRECT|faq|0|0.85|620c3815c7d233db"],"unmatched":[]}',
    },
    P10: {
      retrieval: '{"hits":["DIRECT|faq|0|0.85|21ba9cfbcb828ce7"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["forma","pagamento"],"hits":["DIRECT|faq|0|0.85|91cdffeb44e731df"],"unmatched":[]}',
    },
    P11: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.2607|7ce2f066da7e3186","DIRECT|catalog|0|0.2607|6a37b9205c0760f9","DIRECT|faq|0|0.85|21ba9cfbcb828ce7","DIRECT|installation|0|0.5107|6a3974c64f2a5332"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["instrumento","garantia"],"hits":["DIRECT|calibration|0|0.2607|7ce2f066da7e3186","DIRECT|catalog|0|0.2607|9ffe295d3f8d89a0","DIRECT|faq|0|0.85|98e4707309225ee1","DIRECT|installation|0|0.5107|62197bdb844887ea"],"unmatched":[]}',
    },
    P13: {
      retrieval:
        '{"hits":["CONTEXT|calibration|0|0.1302|7ce2f066da7e3186","CONTEXT|catalog|0|0.2302|6a37b9205c0760f9","CONTEXT|prices|0|0.1302|393100c1cb151a05","DIRECT|installation|0|1|6a3974c64f2a5332","DIRECT|installation|1|0.9198|945dfb00624a0cb9"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["raio","minimo","curvatura","capilar","selo","50"],"hits":["CONTEXT|calibration|0|0.1302|7ce2f066da7e3186","CONTEXT|catalog|0|0.2302|5c7f93d62d29598c","CONTEXT|prices|0|0.1302|393100c1cb151a05","DIRECT|installation|0|1|28b83ca5488ad070","DIRECT|installation|1|0.9198|35ec732031d388f2"],"unmatched":[]}',
    },
    P14: {
      retrieval:
        '{"hits":["DIRECT|installation|0|0.6715|6a3974c64f2a5332","DIRECT|installation|1|0.4073|945dfb00624a0cb9"],"truncated":false,"unmatched":["desmontar"]}',
      preview:
        '{"terms":["posso","desmontar","selo","diafragma","capilar"],"hits":["DIRECT|installation|0|0.6715|16d786042cc201e2","DIRECT|installation|1|0.4073|35ec732031d388f2"],"unmatched":["desmontar"]}',
    },
    P12: {
      retrieval:
        '{"hits":["DIRECT|faq|0|0.5405|21ba9cfbcb828ce7","DIRECT|hostile|0|0.85|72c9d1145dce2cc0"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["horario","atendimento","comercial"],"hits":["DIRECT|faq|0|0.5405|ca410e59aacdf7ba","DIRECT|hostile|0|0.85|72c9d1145dce2cc0"],"unmatched":[]}',
    },
    C01: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.75|7ce2f066da7e3186","DIRECT|catalog|0|0.8|6a37b9205c0760f9","DIRECT|hostile|0|0.75|72c9d1145dce2cc0","DIRECT|prices|0|0.75|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["310"],"hits":["DIRECT|calibration|0|0.75|7ce2f066da7e3186","DIRECT|catalog|0|0.8|930fa27cbce2ff5d","DIRECT|hostile|0|0.75|72c9d1145dce2cc0","DIRECT|prices|0|0.75|393100c1cb151a05"],"unmatched":[]}',
    },
    C02: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.459|7ce2f066da7e3186","DIRECT|catalog|0|0.659|6a37b9205c0760f9","DIRECT|installation|0|0.2295|6a3974c64f2a5332","DIRECT|prices|0|0.2295|393100c1cb151a05"],"truncated":false,"unmatched":["qt310"]}',
      preview:
        '{"terms":["qt310","faixa","pressao"],"hits":["DIRECT|calibration|0|0.459|7ce2f066da7e3186","DIRECT|catalog|0|0.659|02502de6afc382fb","DIRECT|installation|0|0.2295|13bcecd89caef5b0","DIRECT|prices|0|0.2295|393100c1cb151a05"],"unmatched":["qt310"]}',
    },
    C03: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.5339|6a37b9205c0760f9","DIRECT|prices|0|0.2179|393100c1cb151a05"],"truncated":false,"unmatched":["serve"]}',
      preview:
        '{"terms":["3100","serve","pt100"],"hits":["DIRECT|catalog|0|0.5339|fc877765c9233cc7","DIRECT|prices|0|0.2179|393100c1cb151a05"],"unmatched":["serve"]}',
    },
    C04: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.2833|7ce2f066da7e3186","DIRECT|catalog|0|0.4333|6a37b9205c0760f9","DIRECT|prices|0|0.2833|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["informacao","100"],"hits":["DIRECT|calibration|0|0.2833|7ce2f066da7e3186","DIRECT|catalog|0|0.4333|93ca3c7c3c04d7d5","DIRECT|prices|0|0.2833|393100c1cb151a05"],"unmatched":[]}',
    },
    C05: {
      retrieval: '{"hits":[],"truncated":false,"unmatched":["999"]}',
      preview: '{"terms":["modelo","999"],"hits":[],"unmatched":["999"]}',
    },
    C06: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.4333|6a37b9205c0760f9","DIRECT|hostile|0|0.2833|72c9d1145dce2cc0","DIRECT|installation|0|0.2833|6a3974c64f2a5332"],"truncated":false,"unmatched":["2000"]}',
      preview:
        '{"terms":["valvula","2000"],"hits":["DIRECT|catalog|0|0.4333|59c258d42fe361a6","DIRECT|hostile|0|0.2833|72c9d1145dce2cc0","DIRECT|installation|0|0.2833|d95d6d50ec1f5f1a"],"unmatched":["2000"]}',
    },
    C07: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.2833|7ce2f066da7e3186","DIRECT|catalog|0|1|6a37b9205c0760f9","DIRECT|prices|0|0.2833|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["pressao","80"],"hits":["DIRECT|calibration|0|0.2833|7ce2f066da7e3186","DIRECT|catalog|0|1|cbbb64086fde0da1","DIRECT|prices|0|0.2833|393100c1cb151a05"],"unmatched":[]}',
    },
    M01: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.3251|7ce2f066da7e3186","DIRECT|catalog|0|0.3751|6a37b9205c0760f9","DIRECT|faq|0|0.5249|21ba9cfbcb828ce7","DIRECT|hostile|0|0.3251|72c9d1145dce2cc0","DIRECT|prices|0|0.9|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["preco","310"],"hits":["DIRECT|calibration|0|0.3251|7ce2f066da7e3186","DIRECT|catalog|0|0.3751|930fa27cbce2ff5d","DIRECT|faq|0|0.5249|ca410e59aacdf7ba","DIRECT|hostile|0|0.3251|72c9d1145dce2cc0","DIRECT|prices|0|0.9|393100c1cb151a05"],"unmatched":[]}',
    },
    M02: {
      retrieval:
        '{"hits":["CONTEXT|hostile|0|0.3131|72c9d1145dce2cc0","DIRECT|catalog|0|0.2239|6a37b9205c0760f9","DIRECT|prices|0|0.2239|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["quanto","custa","520"],"hits":["CONTEXT|hostile|0|0.3131|72c9d1145dce2cc0","DIRECT|catalog|0|0.2239|a0726821b6497016","DIRECT|prices|0|0.2239|393100c1cb151a05"],"unmatched":[]}',
    },
    M03: {
      retrieval:
        '{"hits":["CONTEXT|calibration|0|0.2298|7ce2f066da7e3186","CONTEXT|installation|0|0.2298|6a3974c64f2a5332","CONTEXT|installation|1|0.5654|945dfb00624a0cb9","DIRECT|catalog|0|0.6644|6a37b9205c0760f9","DIRECT|prices|0|0.5144|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["valor","transmissor","3100"],"hits":["CONTEXT|calibration|0|0.2298|7ce2f066da7e3186","CONTEXT|installation|0|0.2298|45bc901c2c9d9495","CONTEXT|installation|1|0.5654|4bed48408fca48dc","DIRECT|catalog|0|0.6644|93ca3c7c3c04d7d5","DIRECT|prices|0|0.5144|393100c1cb151a05"],"unmatched":[]}',
    },
    M04: {
      retrieval:
        '{"hits":["CONTEXT|faq|0|0.6167|21ba9cfbcb828ce7","DIRECT|catalog|0|0.2833|6a37b9205c0760f9"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["prazo","entrega","200"],"hits":["CONTEXT|faq|0|0.6167|620c3815c7d233db","DIRECT|catalog|0|0.2833|114709a7006b806a"],"unmatched":[]}',
    },
    M05: {
      retrieval:
        '{"hits":["CONTEXT|faq|0|0.4714|21ba9cfbcb828ce7","DIRECT|catalog|0|0.4286|6a37b9205c0760f9","DIRECT|installation|0|0.3286|6a3974c64f2a5332"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["40","estoque"],"hits":["CONTEXT|faq|0|0.4714|0dbab1c5c8ed8b68","DIRECT|catalog|0|0.4286|7224bad0e46cd06b","DIRECT|installation|0|0.3286|c58e66bd4eae0ec5"],"unmatched":[]}',
    },
    M06: {
      retrieval:
        '{"hits":["CONTEXT|faq|0|0.2508|21ba9cfbcb828ce7","CONTEXT|prices|0|0.3008|393100c1cb151a05","DIRECT|catalog|0|0.8492|6a37b9205c0760f9","DIRECT|hostile|0|0.168|72c9d1145dce2cc0","DIRECT|installation|0|0.168|6a3974c64f2a5332"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["preco","valvula","gaveta","150"],"hits":["CONTEXT|faq|0|0.2508|ca410e59aacdf7ba","CONTEXT|prices|0|0.3008|393100c1cb151a05","DIRECT|catalog|0|0.8492|1102df6f842e4ba7","DIRECT|hostile|0|0.168|72c9d1145dce2cc0","DIRECT|installation|0|0.168|d95d6d50ec1f5f1a"],"unmatched":[]}',
    },
    N01: {
      retrieval: '{"hits":[],"truncated":false,"unmatched":["helicoptero"]}',
      preview: '{"terms":["preco","helicoptero"],"hits":[],"unmatched":["helicoptero"]}',
    },
    N02: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.225|6a37b9205c0760f9"],"truncated":false,"unmatched":["medidor","ultrassonico"]}',
      preview:
        '{"terms":["vendem","medidor","vazao","ultrassonico"],"hits":["DIRECT|catalog|0|0.225|6401e46bbb7e3398"],"unmatched":["medidor","ultrassonico"]}',
    },
    N03: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.2179|7ce2f066da7e3186","DIRECT|catalog|0|0.2679|6a37b9205c0760f9"],"truncated":false,"unmatched":["submersa","poco"]}',
      preview:
        '{"terms":["bomba","submersa","poco"],"hits":["DIRECT|calibration|0|0.2179|7ce2f066da7e3186","DIRECT|catalog|0|0.2679|ad272481942b8c6c"],"unmatched":["submersa","poco"]}',
    },
    N04: {
      retrieval: '{"hits":[],"truncated":false,"unmatched":["manutencao","condicionado"]}',
      preview:
        '{"terms":["fazem","manutencao","condicionado"],"hits":[],"unmatched":["manutencao","condicionado"]}',
    },
    N05: {
      retrieval:
        '{"hits":["CONTEXT|faq|0|0.2739|21ba9cfbcb828ce7","CONTEXT|prices|0|0.3239|393100c1cb151a05","DIRECT|catalog|0|0.3131|6a37b9205c0760f9"],"truncated":false,"unmatched":["umidade"]}',
      preview:
        '{"terms":["preco","sensor","umidade"],"hits":["CONTEXT|faq|0|0.2739|ca410e59aacdf7ba","CONTEXT|prices|0|0.3239|393100c1cb151a05","DIRECT|catalog|0|0.3131|e8d4a83507b29d2a"],"unmatched":["umidade"]}',
    },
    I01: {
      retrieval: '{"hits":[],"truncated":false,"unmatched":["transmissor","pressao"]}',
      preview:
        '{"terms":["vendem","transmissor","pressao"],"hits":[],"unmatched":["transmissor","pressao"]}',
    },
    I02: {
      retrieval:
        '{"hits":["DIRECT|helicopters|0|0.75|c84146763c9a61f4"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["310"],"hits":["DIRECT|helicopters|0|0.75|c84146763c9a61f4"],"unmatched":[]}',
    },
    I03: {
      retrieval: '{"hits":[],"truncated":false,"unmatched":["helicoptero","125"]}',
      preview: '{"terms":["helicoptero","125"],"hits":[],"unmatched":["helicoptero","125"]}',
    },
    I04: {
      retrieval:
        '{"hits":["DIRECT|helicopters|0|0.3333|c84146763c9a61f4"],"truncated":false,"unmatched":["mes"]}',
      preview:
        '{"terms":["garantia","12","mes"],"hits":["DIRECT|helicopters|0|0.3333|c84146763c9a61f4"],"unmatched":["mes"]}',
    },
    H01: {
      retrieval:
        '{"hits":["DIRECT|catalog|0|0.4333|6a37b9205c0760f9","DIRECT|hostile|0|0.8|72c9d1145dce2cc0","DIRECT|installation|0|0.2833|6a3974c64f2a5332"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["desconto","valvula"],"hits":["DIRECT|catalog|0|0.4333|59c258d42fe361a6","DIRECT|hostile|0|0.8|72c9d1145dce2cc0","DIRECT|installation|0|0.2833|d95d6d50ec1f5f1a"],"unmatched":[]}',
    },
    H02: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.2607|7ce2f066da7e3186","DIRECT|catalog|0|0.3107|6a37b9205c0760f9","DIRECT|hostile|0|0.2607|72c9d1145dce2cc0","DIRECT|prices|0|0.2607|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["caracteristica","310"],"hits":["DIRECT|calibration|0|0.2607|7ce2f066da7e3186","DIRECT|catalog|0|0.3107|930fa27cbce2ff5d","DIRECT|hostile|0|0.2607|72c9d1145dce2cc0","DIRECT|prices|0|0.2607|393100c1cb151a05"],"unmatched":[]}',
    },
    H03: {
      retrieval:
        '{"hits":["DIRECT|calibration|0|0.8|7ce2f066da7e3186","DIRECT|catalog|0|0.95|6a37b9205c0760f9","DIRECT|installation|0|0.8|6a3974c64f2a5332","DIRECT|installation|1|0.75|945dfb00624a0cb9","DIRECT|prices|0|0.8|393100c1cb151a05"],"truncated":false,"unmatched":[]}',
      preview:
        '{"terms":["transmissor"],"hits":["DIRECT|calibration|0|0.8|7ce2f066da7e3186","DIRECT|catalog|0|0.95|9ca5751c133e2103","DIRECT|installation|0|0.8|45bc901c2c9d9495","DIRECT|installation|1|0.75|8ffe82fda4bd18b6","DIRECT|prices|0|0.8|393100c1cb151a05"],"unmatched":[]}',
    },
  };
