import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';

type NivelLog = 'error' | 'warn' | 'success' | 'info' | 'debug';

// Prioridade dos níveis: quanto menor o número, mais severo (mesma convenção do winston).
const NIVEIS: Record<NivelLog, number> = {
  error: 0,
  warn: 1,
  success: 2,
  info: 3,
  debug: 4,
};

const ANSI = {
  vermelho: '\x1b[31m',
  amarelo: '\x1b[33m',
  verde: '\x1b[32m',
  azul: '\x1b[34m',
  cinza: '\x1b[90m',
  reset: '\x1b[0m',
};

const ESTILO_NIVEL: Record<
  NivelLog,
  { cor: string; icone: string; rotulo: string }
> = {
  error: { cor: ANSI.vermelho, icone: '✖', rotulo: 'ERROR' },
  warn: { cor: ANSI.amarelo, icone: '⚠', rotulo: 'WARNING' },
  success: { cor: ANSI.verde, icone: '✔', rotulo: 'SUCCESS' },
  info: { cor: ANSI.azul, icone: 'ℹ', rotulo: 'INFO' },
  debug: { cor: ANSI.cinza, icone: '•', rotulo: 'DEBUG' },
};

// Formato real das linhas produzidas pelo winstonLogger abaixo — sempre passamos
// `message` como string e `context` via metadata, então tipamos explicitamente
// em vez de depender do tipo genérico (e pouco preciso) do winston para `info`.
interface LinhaLog {
  level: string;
  message: string;
  timestamp: string;
  context: string;
}

const formato = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((info) => {
    const linha = info as unknown as LinhaLog;
    const estilo = ESTILO_NIVEL[linha.level as NivelLog] ?? ESTILO_NIVEL.info;
    const rotulo = `${estilo.cor}${estilo.icone} ${estilo.rotulo}${ANSI.reset}`;
    const contexto = linha.context
      ? ` ${ANSI.cinza}[${linha.context}]${ANSI.reset}`
      : '';
    return `${ANSI.cinza}${linha.timestamp}${ANSI.reset} ${rotulo}${contexto} ${linha.message}`;
  }),
);

const winstonLogger = winston.createLogger({
  levels: NIVEIS,
  level: 'debug',
  format: formato,
  transports: [new winston.transports.Console()],
});

/**
 * Logger da aplicação sobre o Winston, com nível/cor/ícone dedicados por tipo de evento:
 * INFO (azul, ℹ), SUCCESS (verde, ✔), WARNING (amarelo, ⚠) e ERROR (vermelho, ✖).
 * Reutilizado por todos os services que precisam logar (evita configurar o Winston em cada um).
 *
 * Implementa `LoggerService` do Nest para também poder ser usado como logger global da
 * aplicação (`NestFactory.create(AppModule, { logger: new AppLogger() })`), fazendo até
 * as mensagens internas do framework (bootstrap, rotas mapeadas) saírem no mesmo formato.
 * Nesse uso, o contexto vem por chamada (parâmetro `contexto`, como o próprio Nest já faz);
 * no uso normal dentro de um service, o contexto é fixado uma vez no construtor.
 */
export class AppLogger implements LoggerService {
  constructor(private readonly contexto?: string) {}

  log(mensagem: string, contexto?: string): void {
    winstonLogger.log('info', mensagem, { context: contexto ?? this.contexto });
  }

  success(mensagem: string, contexto?: string): void {
    winstonLogger.log('success', mensagem, {
      context: contexto ?? this.contexto,
    });
  }

  warn(mensagem: string, contexto?: string): void {
    winstonLogger.log('warn', mensagem, { context: contexto ?? this.contexto });
  }

  /** `trace` segue a mesma posição usada pelo Nest (log(message, trace, context)). */
  error(mensagem: string, trace?: string, contexto?: string): void {
    const texto = trace ? `${mensagem}\n${trace}` : mensagem;
    winstonLogger.log('error', texto, { context: contexto ?? this.contexto });
  }
}
