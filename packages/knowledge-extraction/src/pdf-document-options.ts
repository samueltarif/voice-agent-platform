import path from 'node:path';

/**
 * Base LOCAL dos cMaps no formato que o pdf.js aceita: a validação exige que
 * termine em `/` (no Windows `path.sep` é `\` e era recusado), e o leitor do
 * Node concatena base + nome do arquivo e chama `fs.readFile` com a STRING —
 * por isso não pode ser uma URL `file://` (string não é tratada como URL), e
 * sim um caminho com `/` como separador, que o Windows também aceita.
 */
export function localCMapBaseUrl(pdfjsDir: string, pathApi: path.PlatformPath = path): string {
  return `${pathApi.join(pdfjsDir, 'cmaps').split(pathApi.sep).join('/')}/`;
}

/**
 * Opções FIXAS do `getDocument` (DEC-066). Só dados em memória: sem `url`,
 * `docBaseUrl`, fontes do sistema, fontes padrão, WebAssembly, XFA ou `eval`.
 * cMaps vêm de arquivos LOCAIS do próprio pacote (fontes CID/CJK).
 */
export function pdfDocumentOptions(data: Uint8Array, pdfjsDir: string) {
  return {
    data,
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    stopAtErrors: false,
    verbosity: 0,
    cMapUrl: localCMapBaseUrl(pdfjsDir),
    cMapPacked: true,
  } as const;
}
