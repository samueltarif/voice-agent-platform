import { createHash } from 'node:crypto';

export const KNOWLEDGE_DOCUMENT_MAX_CHARS = 200_000;

export function normalizeKnowledgeText(rawText: string): string {
  if (typeof rawText !== 'string') {
    throw new Error('rawText must be a string');
  }

  const nfc = rawText.normalize('NFC');
  const standardNewlines = nfc.replace(/\r\n|\r/g, '\n');
  const printableOnly = standardNewlines.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
    '',
  );

  const linesTrimmed = printableOnly
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  const collapsedNewlines = linesTrimmed.replace(/\n{3,}/g, '\n\n');
  return collapsedNewlines.trim();
}

export function computeContentHash(text: string, algorithm = 'sha256'): string {
  return createHash(algorithm).update(text, 'utf8').digest('hex');
}

export function validateAndNormalizeKnowledgeText(rawText: unknown): {
  normalizedText: string;
  contentHash: string;
} {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('Knowledge document rawText must not be empty');
  }
  if (rawText.length > KNOWLEDGE_DOCUMENT_MAX_CHARS) {
    throw new Error(
      `Knowledge document rawText exceeds maximum length of ${KNOWLEDGE_DOCUMENT_MAX_CHARS} characters`,
    );
  }

  const normalizedText = normalizeKnowledgeText(rawText);
  if (normalizedText.length === 0) {
    throw new Error('Knowledge document rawText is empty after normalization');
  }

  const contentHash = computeContentHash(normalizedText);
  return { normalizedText, contentHash };
}
