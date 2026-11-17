import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';

/** Mensagens em português para as recusas do envio de arquivo (DEC-065/DEC-066). */
export const KNOWLEDGE_UPLOAD_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.INVALID_FILE_NAME]: 'Nome de arquivo inválido. Renomeie o arquivo e tente de novo.',
  [CODES.INVALID_ENCODING]: 'Não foi possível ler o arquivo enviado. Tente de novo.',
  [CODES.TOO_LARGE]:
    'Arquivo grande demais. Limite: 2 MB para TXT/Markdown e 10 MB para DOCX e PDF.',
  [CODES.UNSUPPORTED_FORMAT]: 'Formato não aceito. Envie um arquivo .txt, .md, .docx ou .pdf.',
  [CODES.LEGACY_DOC]: 'Arquivos .doc antigos não são aceitos. Salve como .docx e envie de novo.',
  [CODES.FORMAT_MISMATCH]: 'O conteúdo do arquivo não corresponde à extensão informada.',
  [CODES.INVALID_TEXT_ENCODING]:
    'O texto não está em UTF-8. Salve o arquivo como UTF-8 e tente de novo.',
  [CODES.BINARY_CONTENT]: 'O arquivo parece binário, não texto.',
  [CODES.MALFORMED_FILE]: 'O arquivo está corrompido ou incompleto.',
  [CODES.MACRO_ENABLED]: 'Documentos com macros não são aceitos.',
  [CODES.UNSAFE_XML]: 'O documento contém estruturas não permitidas e foi recusado.',
  [CODES.ARCHIVE_LIMIT_EXCEEDED]: 'O documento excede os limites de segurança de descompactação.',
  [CODES.NO_TEXT]: 'Nenhum texto foi encontrado no arquivo.',
  [CODES.TEXT_TOO_LONG]:
    'O texto extraído passa de 200.000 caracteres. Divida o arquivo em partes.',
  [CODES.TIMEOUT]: 'A leitura do arquivo demorou demais e foi interrompida.',
  [CODES.RESOURCE_LIMIT]: 'O arquivo exigiu recursos demais para ser lido e foi recusado.',
  [CODES.BUSY]: 'Muitos arquivos sendo lidos agora. Aguarde alguns segundos e tente de novo.',
  [CODES.PDF_ENCRYPTED]:
    'PDF protegido por senha ou com restrições de cópia. Envie uma versão sem proteção.',
  [CODES.PDF_TOO_MANY_PAGES]: 'O PDF tem mais de 300 páginas. Divida o arquivo em partes.',
  [CODES.PDF_NO_TEXT]:
    'O PDF não tem texto pesquisável (parece digitalizado). OCR não é suportado: exporte o PDF com texto ou cole o conteúdo.',
  [CODES.PDF_XFA_UNSUPPORTED]:
    'Formulários PDF dinâmicos (XFA) não são aceitos. Exporte como PDF comum ou cole o conteúdo.',
  PAYLOAD_TOO_LARGE:
    'Arquivo grande demais. Limite: 2 MB para TXT/Markdown e 10 MB para DOCX e PDF.',
};
