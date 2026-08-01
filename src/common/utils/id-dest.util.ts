/** Calcula o idDest da NFe: 1 = operação interna, 2 = interestadual. Sem UF do destinatário, assume operação interna. */
export function calcularIdDest(
  ufEmitente: string,
  ufDestinatario?: string,
): string {
  if (!ufDestinatario) return '1';
  return ufDestinatario.toUpperCase() === ufEmitente.toUpperCase() ? '1' : '2';
}
