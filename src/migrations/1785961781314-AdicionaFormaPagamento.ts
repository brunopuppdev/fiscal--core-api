import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdicionaFormaPagamento1785961781314 implements MigrationInterface {
  name = 'AdicionaFormaPagamento1785961781314';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Coluna adicionada sem DEFAULT (dado deve vir sempre de quem cria a nota). Para as notas
    // já existentes, o backfill abaixo grava '01' (Dinheiro) porque era o valor fixo que o
    // builder do XML já usava até aqui (ver nfe-xml-builder.service.ts) — reflete fielmente
    // o que foi de fato emitido no XML dessas notas, não é um default arbitrário.
    await queryRunner.query(
      `ALTER TABLE "notas_fiscais" ADD "forma_pagamento" character varying(2)`,
    );
    await queryRunner.query(
      `UPDATE "notas_fiscais" SET "forma_pagamento" = '01' WHERE "forma_pagamento" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_fiscais" ALTER COLUMN "forma_pagamento" SET NOT NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "notas_fiscais"."forma_pagamento" IS 'Código SEFAZ da forma de pagamento (grupo pag/detPag do XML): 01 Dinheiro, 02 Cheque, 03 Cartão de Crédito, 04 Cartão de Débito, 05 Crédito Loja, 10 Vale Alimentação, 11 Vale Refeição, 12 Vale Presente, 13 Vale Combustível, 14 Duplicata Mercantil, 15 Boleto Bancário, 16 Depósito Bancário, 17 PIX, 18 Transferência bancária/Carteira Digital, 19 Fidelidade/Cashback, 90 Sem pagamento, 99 Outros'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON COLUMN "notas_fiscais"."forma_pagamento" IS 'Código SEFAZ da forma de pagamento (grupo pag/detPag do XML): 01 Dinheiro, 02 Cheque, 03 Cartão de Crédito, 04 Cartão de Débito, 05 Crédito Loja, 10 Vale Alimentação, 11 Vale Refeição, 12 Vale Presente, 13 Vale Combustível, 14 Duplicata Mercantil, 15 Boleto Bancário, 16 Depósito Bancário, 17 PIX, 18 Transferência bancária/Carteira Digital, 19 Fidelidade/Cashback, 90 Sem pagamento, 99 Outros'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_fiscais" DROP COLUMN "forma_pagamento"`,
    );
  }
}
