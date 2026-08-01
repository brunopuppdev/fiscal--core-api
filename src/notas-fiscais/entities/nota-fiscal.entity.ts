import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { StatusNota } from '../../common/enums/status-nota.enum';
import { ItemNota } from './item-nota.entity';

@Entity('notas_fiscais')
export class NotaFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 2, enum: ModeloDocumento })
  modelo: ModeloDocumento;

  @Column({ type: 'int' })
  serie: number;

  @Column({ type: 'int' })
  numero: number;

  @Column({ name: 'chave_acesso', type: 'varchar', length: 44, unique: true })
  chaveAcesso: string;

  @Column({
    type: 'varchar',
    length: 20,
    enum: StatusNota,
    default: StatusNota.RASCUNHO,
  })
  status: StatusNota;

  @Column({ type: 'int', comment: '1 = Produção, 2 = Homologação' })
  ambiente: number;

  @Column({ name: 'natureza_operacao', type: 'varchar', length: 60 })
  naturezaOperacao: string;

  @Column({
    name: 'destinatario_nome',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  destinatarioNome: string | null;

  @Column({
    name: 'destinatario_documento',
    type: 'varchar',
    length: 14,
    nullable: true,
  })
  destinatarioDocumento: string | null;

  @Column({
    name: 'destinatario_email',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  destinatarioEmail: string | null;

  @Column({ name: 'destinatario_endereco', type: 'jsonb', nullable: true })
  destinatarioEndereco: Record<string, unknown> | null;

  @Column({ name: 'valor_total', type: 'numeric', precision: 12, scale: 2 })
  valorTotal: string;

  @Column({ name: 'xml_assinado', type: 'text', nullable: true })
  xmlAssinado: string | null;

  @Column({ name: 'xml_autorizado', type: 'text', nullable: true })
  xmlAutorizado: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  protocolo: string | null;

  @Column({
    name: 'motivo_status',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  motivoStatus: string | null;

  @Column({
    name: 'codigo_status',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  codigoStatus: string | null;

  @Column({ name: 'data_emissao', type: 'timestamptz' })
  dataEmissao: Date;

  @Column({ name: 'data_autorizacao', type: 'timestamptz', nullable: true })
  dataAutorizacao: Date | null;

  @OneToMany(() => ItemNota, (item) => item.notaFiscal, {
    cascade: true,
    eager: true,
  })
  itens: ItemNota[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
