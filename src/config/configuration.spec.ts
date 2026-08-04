import configuration from './configuration';

const CHAVES_ENV = [
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'DB_SYNCHRONIZE',
  'SEFAZ_AMBIENTE',
  'SEFAZ_UF',
  'CERTIFICADO_PATH',
  'CERTIFICADO_SENHA',
  'EMITENTE_CNPJ',
  'EMITENTE_RAZAO_SOCIAL',
  'EMITENTE_NOME_FANTASIA',
  'EMITENTE_IE',
  'EMITENTE_CRT',
  'EMITENTE_LOGRADOURO',
  'EMITENTE_NUMERO',
  'EMITENTE_COMPLEMENTO',
  'EMITENTE_BAIRRO',
  'EMITENTE_MUNICIPIO',
  'EMITENTE_COD_MUNICIPIO',
  'EMITENTE_UF',
  'EMITENTE_CEP',
  'EMITENTE_TELEFONE',
  'NFE_SERIE',
  'NFCE_SERIE',
  'NFCE_CSC',
  'NFCE_CSC_ID',
] as const;

describe('configuration', () => {
  const envOriginal = { ...process.env };

  afterEach(() => {
    for (const chave of CHAVES_ENV) {
      delete process.env[chave];
    }
    process.env = { ...envOriginal };
  });

  describe('valores padrão (sem variáveis de ambiente configuradas)', () => {
    beforeEach(() => {
      for (const chave of CHAVES_ENV) {
        delete process.env[chave];
      }
    });

    it('usa port 3000 como padrão', () => {
      expect(configuration().port).toBe(3000);
    });

    it('usa os valores padrão de database (host localhost, porta 5432, synchronize true)', () => {
      const { database } = configuration();
      expect(database).toEqual({
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgres',
        database: 'emissornf',
        synchronize: true,
      });
    });

    it('usa ambiente 2 (homologação) e UF SP como padrão para sefaz', () => {
      expect(configuration().sefaz).toEqual({ ambiente: 2, uf: 'SP' });
    });

    it('usa o caminho padrão do certificado e senha vazia', () => {
      expect(configuration().certificado).toEqual({
        path: './certs/certificado.pfx',
        senha: '',
      });
    });

    it('usa IE=ISENTO, CRT=4 e UF=SP como padrão para o emitente, e strings vazias para os demais campos obrigatórios', () => {
      const { emitente } = configuration();
      expect(emitente.ie).toBe('ISENTO');
      expect(emitente.crt).toBe(4);
      expect(emitente.uf).toBe('SP');
      expect(emitente.cnpj).toBe('');
      expect(emitente.razaoSocial).toBe('');
    });

    it('deixa complemento e telefone do emitente undefined quando não informados (campos opcionais)', () => {
      const { emitente } = configuration();
      expect(emitente.complemento).toBeUndefined();
      expect(emitente.telefone).toBeUndefined();
    });

    it('usa série 1 como padrão para NF-e e NFC-e', () => {
      expect(configuration().numeracao).toEqual({ nfeSerie: 1, nfceSerie: 1 });
    });

    it('usa strings vazias como padrão para CSC e CSC ID da NFC-e', () => {
      expect(configuration().nfce).toEqual({ csc: '', cscId: '' });
    });
  });

  describe('leitura e conversão de variáveis de ambiente informadas', () => {
    it('converte PORT, portas de banco e séries (strings) para number', () => {
      process.env.PORT = '4000';
      process.env.DB_PORT = '5433';
      process.env.NFE_SERIE = '3';
      process.env.NFCE_SERIE = '4';

      const config = configuration();

      expect(config.port).toBe(4000);
      expect(config.database.port).toBe(5433);
      expect(config.numeracao).toEqual({ nfeSerie: 3, nfceSerie: 4 });
      expect(typeof config.port).toBe('number');
      expect(typeof config.database.port).toBe('number');
    });

    it('converte SEFAZ_AMBIENTE e EMITENTE_CRT (strings) para number', () => {
      process.env.SEFAZ_AMBIENTE = '1';
      process.env.EMITENTE_CRT = '4';

      const config = configuration();

      expect(config.sefaz.ambiente).toBe(1);
      expect(config.emitente.crt).toBe(4);
      expect(typeof config.sefaz.ambiente).toBe('number');
    });

    it('interpreta DB_SYNCHRONIZE="false" como boolean false (e qualquer outro valor como false)', () => {
      process.env.DB_SYNCHRONIZE = 'false';
      expect(configuration().database.synchronize).toBe(false);

      process.env.DB_SYNCHRONIZE = 'qualquer-coisa';
      expect(configuration().database.synchronize).toBe(false);
    });

    it('interpreta DB_SYNCHRONIZE="true" como boolean true', () => {
      process.env.DB_SYNCHRONIZE = 'true';
      expect(configuration().database.synchronize).toBe(true);
    });

    it('repassa strings de configuração (host, uf, credenciais, dados do emitente) sem conversão', () => {
      process.env.DB_HOST = 'db.interno';
      process.env.SEFAZ_UF = 'rj';
      process.env.EMITENTE_CNPJ = '11222333000181'; // fictício
      process.env.EMITENTE_RAZAO_SOCIAL = 'Fictícia MEI LTDA';
      process.env.CERTIFICADO_PATH = '/opt/certs/emitente.pfx';
      process.env.CERTIFICADO_SENHA = 'segredo-fake';

      const config = configuration();

      expect(config.database.host).toBe('db.interno');
      expect(config.sefaz.uf).toBe('rj');
      expect(config.emitente.cnpj).toBe('11222333000181');
      expect(config.emitente.razaoSocial).toBe('Fictícia MEI LTDA');
      expect(config.certificado.path).toBe('/opt/certs/emitente.pfx');
      expect(config.certificado.senha).toBe('segredo-fake');
    });

    it('repassa CSC e CSC ID da NFC-e quando informados', () => {
      process.env.NFCE_CSC = 'csc-fake-de-teste';
      process.env.NFCE_CSC_ID = '3';

      expect(configuration().nfce).toEqual({
        csc: 'csc-fake-de-teste',
        cscId: '3',
      });
    });

    it('repassa complemento e telefone do emitente quando informados', () => {
      process.env.EMITENTE_COMPLEMENTO = 'Sala 2';
      process.env.EMITENTE_TELEFONE = '11999999999';

      const { emitente } = configuration();

      expect(emitente.complemento).toBe('Sala 2');
      expect(emitente.telefone).toBe('11999999999');
    });

    it('retorna a estrutura completa esperada do AppConfig (todas as seções presentes)', () => {
      const config = configuration();

      expect(Object.keys(config).sort()).toEqual(
        [
          'port',
          'database',
          'sefaz',
          'certificado',
          'emitente',
          'numeracao',
          'nfce',
        ].sort(),
      );
    });
  });
});
