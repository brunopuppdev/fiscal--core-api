import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdicionaTroco1786039023720 implements MigrationInterface {
  name = 'AdicionaTroco1786039023720';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notas_fiscais" ADD "troco" numeric(12,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "notas_fiscais"."troco" IS 'Valor do troco dado ao cliente (grupo pag/vTroco do XML). Positivo só em vendas à vista com troco (ex.: pagamento em dinheiro com valor recebido maior que o total).'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON COLUMN "notas_fiscais"."troco" IS 'Valor do troco dado ao cliente (grupo pag/vTroco do XML). Positivo só em vendas à vista com troco (ex.: pagamento em dinheiro com valor recebido maior que o total).'`,
    );
    await queryRunner.query(`ALTER TABLE "notas_fiscais" DROP COLUMN "troco"`);
  }
}
