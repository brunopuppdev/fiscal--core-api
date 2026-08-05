import 'dotenv/config';
import { DataSource } from 'typeorm';
import { NotaFiscal } from '../notas-fiscais/entities/nota-fiscal.entity';
import { ItemNota } from '../notas-fiscais/entities/item-nota.entity';
import { NumeracaoControle } from '../notas-fiscais/entities/numeracao-controle.entity';

/**
 * DataSource standalone usado apenas pela CLI do TypeORM (migration:generate/run/revert).
 * Não é usado no bootstrap da aplicação (ver `criarConfigTypeOrm` em `app.module.ts`), que
 * continua controlando `synchronize` via `DB_SYNCHRONIZE`. Aqui `synchronize` é sempre `false`:
 * a CLI só deve gerar/aplicar migrations, nunca sincronizar o schema diretamente.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'emissornf',
  synchronize: false,
  entities: [NotaFiscal, ItemNota, NumeracaoControle],
  migrations: ['src/migrations/*.ts'],
});
