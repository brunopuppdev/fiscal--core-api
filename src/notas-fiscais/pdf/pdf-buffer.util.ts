/**
 * Começa a capturar os chunks emitidos por um documento pdfkit (que é um stream Readable) em
 * um Buffer único. Precisa ser chamado ANTES de `doc.end()` (os listeners de 'data'/'end' têm
 * que estar registrados antes do fim do documento ser sinalizado) — o padrão de uso é:
 *
 *   const doc = new PDFDocument({ ... });
 *   const pdfPronto = capturarPdfEmBuffer(doc);
 *   // ... desenhar o conteúdo, incluindo awaits para imagens (QR Code, código de barras) ...
 *   doc.end();
 *   return pdfPronto;
 *
 * `PDFKit.PDFDocument` é um tipo ambiente global de `@types/pdfkit` — não precisa de import.
 */
export function capturarPdfEmBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
