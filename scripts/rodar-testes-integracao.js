// Orquestra os testes de integração: sobe o Postgres descartável (docker-compose.test.yml),
// roda o Jest com a config de integração, e sempre derruba o container no final —
// mesmo se os testes falharem — para nunca deixar um Postgres de teste esquecido rodando.
const { spawnSync } = require('child_process');

const COMPOSE_FILE = 'docker-compose.test.yml';

function rodar(comando, args) {
  const resultado = spawnSync(comando, args, { stdio: 'inherit', shell: true });
  return resultado.status ?? 1;
}

console.log('Subindo Postgres de teste (docker-compose.test.yml)...');
const statusSubida = rodar('docker', [
  'compose',
  '-f',
  COMPOSE_FILE,
  'up',
  '-d',
  '--wait',
]);

if (statusSubida !== 0) {
  console.error(
    'Falha ao subir o Postgres de teste. Verifique se o Docker Desktop está rodando.',
  );
  process.exit(statusSubida);
}

console.log('Rodando testes de integração...');
const statusTestes = rodar('npx', [
  'cross-env',
  'DB_HOST=localhost',
  'DB_PORT=5433',
  'DB_USERNAME=postgres',
  'DB_PASSWORD=postgres',
  'DB_DATABASE=emissornf_integration',
  'DB_SYNCHRONIZE=true',
  'jest',
  '--config',
  './test/jest-integration.json',
  '--runInBand',
  '--coverage',
]);

console.log('Derrubando Postgres de teste...');
rodar('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v']);

process.exit(statusTestes);
