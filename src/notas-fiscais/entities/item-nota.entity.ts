import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('itens_nota')
export class ItemNota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => NotaFiscal, (nota) => nota.itens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal: NotaFiscal;

  @Column({ name: 'numero_item', type: 'int' })
  numeroItem: number;

  @Column({ type: 'varchar', length: 60 })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  descricao: string;

  /** Código NCM do produto (8 dígitos). Para sucos, geralmente na faixa 2009/2202 — confirme com o contador. */
  @Column({ type: 'varchar', length: 8 })
  ncm: string;

  /** CFOP da operação (ex.: 5102 venda dentro do estado, 6102 fora do estado). */
  @Column({ type: 'varchar', length: 4 })
  cfop: string;

  @Column({ type: 'varchar', length: 6, default: 'UN' })
  unidade: string;

  @Column({ type: 'numeric', precision: 12, scale: 4 })
  quantidade: string;

  @Column({ name: 'valor_unitario', type: 'numeric', precision: 12, scale: 4 })
  valorUnitario: string;

  @Column({ name: 'valor_total', type: 'numeric', precision: 12, scale: 2 })
  valorTotal: string;

  /** CSOSN do Simples Nacional/MEI (ex.: 102 = tributada sem permissão de crédito). */
  @Column({ type: 'varchar', length: 3, default: '102' })
  csosn: string;
}
