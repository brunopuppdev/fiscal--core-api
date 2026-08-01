import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Controle do último número de documento fiscal emitido, por modelo + série.
 * A numeração deve ser sequencial e sem lacunas por série (exceto por inutilização),
 * então o incremento é feito dentro de uma transação com lock (ver NotasFiscaisService).
 */
@Entity('numeracao_controle')
export class NumeracaoControle {
  @PrimaryColumn({ type: 'varchar', length: 2 })
  modelo: string;

  @PrimaryColumn({ type: 'int' })
  serie: number;

  @Column({ name: 'ultimo_numero', type: 'int', default: 0 })
  ultimoNumero: number;
}
