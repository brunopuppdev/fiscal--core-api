// Abre no navegador/app padrão um arquivo do projeto, dado um caminho relativo à raiz.
// Reutilizado pelos scripts "*:open" (relatório de cobertura, dashboard de testes
// unitários, dashboard de testes de integração) em vez de duplicar a mesma lógica.
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const caminhoRelativo = process.argv[2];
if (!caminhoRelativo) {
  console.error('Uso: node scripts/abrir-arquivo.js <caminho-relativo-ao-projeto>');
  process.exit(1);
}

const caminhoAbsoluto = path.resolve(__dirname, '..', caminhoRelativo);

if (!fs.existsSync(caminhoAbsoluto)) {
  console.error(
    `Arquivo não encontrado em "${caminhoAbsoluto}". Rode o comando que gera esse relatório primeiro.`,
  );
  process.exit(1);
}

const comando =
  process.platform === 'win32'
    ? `start "" "${caminhoAbsoluto}"`
    : process.platform === 'darwin'
      ? `open "${caminhoAbsoluto}"`
      : `xdg-open "${caminhoAbsoluto}"`;

exec(comando, (erro) => {
  if (erro) {
    console.error(
      `Não foi possível abrir o arquivo automaticamente. Abra manualmente: ${caminhoAbsoluto}`,
    );
    process.exit(1);
  }
});
