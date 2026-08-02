import { DataSource } from 'typeorm';

/** Limpa as tabelas do domínio entre testes de integração, mantendo o schema (sem recriar). */
export async function limparBanco(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE itens_nota, notas_fiscais, numeracao_controle RESTART IDENTITY CASCADE',
  );
}
