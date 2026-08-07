import { existsSync } from 'fs';

/** Lado máximo (largura/altura) do logotipo no cabeçalho do DANFE/DANFCE, em pontos. */
export const TAMANHO_MAXIMO_LOGO = 70;

/**
 * Desenha o logotipo do emitente (canto superior direito do cabeçalho), se `logoPath` estiver
 * configurado e o arquivo existir. Comportamento degradado, igual ao já usado em
 * `CertificadoService` quando o `.pfx` configurado não existe: nenhum erro é lançado, o PDF
 * simplesmente é gerado sem logo. `fit` preserva a proporção original da imagem (a logo já vem
 * com fundo transparente/redondo, não precisa de recorte/clip).
 *
 * `tamanho` é opcional (default `TAMANHO_MAXIMO_LOGO`) — o modelo visual do DANFCE usa um logo
 * menor (~55pt) do que o DANFE (70pt), daí o parâmetro em vez de uma segunda constante fixa.
 */
export function desenharLogoEmitente(
  doc: PDFKit.PDFDocument,
  logoPath: string | undefined,
  x: number,
  y: number,
  tamanho: number = TAMANHO_MAXIMO_LOGO,
): void {
  if (!logoPath || !existsSync(logoPath)) return;
  doc.image(logoPath, x, y, {
    fit: [tamanho, tamanho],
    align: 'right',
  });
}
