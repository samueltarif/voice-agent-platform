import path from 'node:path';

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
    cMapUrl: path.join(pdfjsDir, 'cmaps') + path.sep,
    cMapPacked: true,
  } as const;
}
