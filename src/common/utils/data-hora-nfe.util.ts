/** Formata a data/hora no padrão exigido pela NF-e: AAAA-MM-DDThh:mm:ssTZD (ex.: -03:00 para horário de Brasília). */
export function formatarDataHoraNfe(data: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const offsetMin = -data.getTimezoneOffset();
  const sinal = offsetMin >= 0 ? '+' : '-';
  const offsetH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offsetM = pad(Math.abs(offsetMin) % 60);
  return (
    `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}` +
    `T${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}` +
    `${sinal}${offsetH}:${offsetM}`
  );
}
