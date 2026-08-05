import { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1785947704056 implements MigrationInterface {
  name = 'Baseline1785947704056';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "itens_nota" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "numero_item" integer NOT NULL, "codigo" character varying(60) NOT NULL, "descricao" character varying(120) NOT NULL, "ncm" character varying(8) NOT NULL, "cfop" character varying(4) NOT NULL, "unidade" character varying(6) NOT NULL DEFAULT 'UN', "quantidade" numeric(12,4) NOT NULL, "valor_unitario" numeric(12,4) NOT NULL, "valor_total" numeric(12,2) NOT NULL, "csosn" character varying(3) NOT NULL DEFAULT '102', "nota_fiscal_id" uuid, CONSTRAINT "PK_0f69cf87d2c44ae01959ecbb572" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notas_fiscais" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "modelo" character varying(2) NOT NULL, "serie" integer NOT NULL, "numero" integer NOT NULL, "chave_acesso" character varying(44) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'RASCUNHO', "ambiente" integer NOT NULL, "natureza_operacao" character varying(60) NOT NULL, "destinatario_nome" character varying(120), "destinatario_documento" character varying(14), "destinatario_email" character varying(120), "destinatario_endereco" jsonb, "valor_total" numeric(12,2) NOT NULL, "xml_assinado" text, "xml_autorizado" text, "protocolo" character varying(20), "motivo_status" character varying(255), "codigo_status" character varying(10), "data_emissao" TIMESTAMP WITH TIME ZONE NOT NULL, "data_autorizacao" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7d25291b6c7b0af080fb49e0539" UNIQUE ("chave_acesso"), CONSTRAINT "PK_c7dcf62527c4f388d8494aa5f55" PRIMARY KEY ("id")); COMMENT ON COLUMN "notas_fiscais"."ambiente" IS '1 = Produção, 2 = Homologação'`,
    );
    await queryRunner.query(
      `CREATE TABLE "numeracao_controle" ("modelo" character varying(2) NOT NULL, "serie" integer NOT NULL, "ultimo_numero" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_21960451a150fd7d1977314e9a1" PRIMARY KEY ("modelo", "serie"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "itens_nota" ADD CONSTRAINT "FK_7e506686556156e52d3dc340e98" FOREIGN KEY ("nota_fiscal_id") REFERENCES "notas_fiscais"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "itens_nota" DROP CONSTRAINT "FK_7e506686556156e52d3dc340e98"`,
    );
    await queryRunner.query(`DROP TABLE "numeracao_controle"`);
    await queryRunner.query(`DROP TABLE "notas_fiscais"`);
    await queryRunner.query(`DROP TABLE "itens_nota"`);
  }
}
