// Abre no navegador padrão o relatório HTML de cobertura (Istanbul) gerado
// pelo Jest em `npm run test:cov` (coverage/lcov-report/index.html).
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const caminhoRelatorio = path.resolve(
  __dirname,
  '..',
  'coverage',
  'lcov-report',
  'index.html',
);

if (!fs.existsSync(caminhoRelatorio)) {
  console.error(
    `Relatório de cobertura não encontrado em "${caminhoRelatorio}". Rode "npm run test:cov" primeiro.`,
  );
  process.exit(1);
}

const comando =
  process.platform === 'win32'
    ? `start "" "${caminhoRelatorio}"`
    : process.platform === 'darwin'
      ? `open "${caminhoRelatorio}"`
      : `xdg-open "${caminhoRelatorio}"`;

exec(comando, (erro) => {
  if (erro) {
    console.error(
      `Não foi possível abrir o relatório automaticamente. Abra manualmente: ${caminhoRelatorio}`,
    );
    process.exit(1);
  }
});
