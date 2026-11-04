import ts from 'typescript';

/**
 * D-S1-ARCH-CHECK (DEC-045): contratos genéricos não usam nomes de fornecedor.
 * Procura identificadores e literais de texto (o AST exclui comentários, que
 * continuam permitidos para documentação). Retorna linha e trecho de cada
 * ocorrência; nenhum dado sensível é lido ou impresso.
 */
export const VENDOR_NAME_PATTERN = /twilio|millis/i;

function isNamedNode(node) {
  return (
    ts.isIdentifier(node) ||
    ts.isPrivateIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

export function findVendorIdentifiers(filePath, content) {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const findings = [];
  function visit(node) {
    if (isNamedNode(node)) {
      const { text } = node;
      if (VENDOR_NAME_PATTERN.test(text)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        findings.push({ line: line + 1, text: text.slice(0, 60) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}
