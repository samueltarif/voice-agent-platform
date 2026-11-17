import type { KnowledgeUploadFormat } from '@voice-agent/contracts';

/** Cabeçalho enviado ao processo filho (1ª linha da stdin), seguido dos bytes. */
export interface ExtractionJobHeader {
  readonly format: KnowledgeUploadFormat;
  readonly length: number;
  /** Pasta do `pdfjs-dist` (cMaps locais). */
  readonly pdfjsDir: string;
  /** Prazo próprio do filho (vigia assíncrona; o pai mata no prazo dele). */
  readonly deadlineMs: number;
  readonly maxRssMb: number;
}

export interface PdfExtractionStats {
  readonly pages: number;
  readonly pagesWithoutText: number;
}

/** Única linha JSON escrita na stdout pelo filho. Erros levam só o código. */
export type ExtractionReply =
  | { readonly ok: true; readonly text: string; readonly pdf?: PdfExtractionStats | undefined }
  | { readonly ok: false; readonly code: string };

export interface ExtractionSuccess {
  readonly text: string;
  readonly pdf?: PdfExtractionStats | undefined;
}
