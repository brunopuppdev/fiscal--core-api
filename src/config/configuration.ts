export interface EmitenteConfig {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  ie: string;
  crt: number;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  codMunicipio: string;
  uf: string;
  cep: string;
  telefone?: string;
}

export interface AppConfig {
  port: number;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    synchronize: boolean;
  };
  sefaz: {
    ambiente: number; // 1 = Produção, 2 = Homologação
    uf: string;
  };
  certificado: {
    path: string;
    senha: string;
  };
  emitente: EmitenteConfig;
  numeracao: {
    nfeSerie: number;
    nfceSerie: number;
  };
  nfce: {
    csc: string;
    cscId: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'emissornf',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
  },
  sefaz: {
    ambiente: parseInt(process.env.SEFAZ_AMBIENTE ?? '2', 10),
    uf: process.env.SEFAZ_UF ?? 'SP',
  },
  certificado: {
    path: process.env.CERTIFICADO_PATH ?? './certs/certificado.pfx',
    senha: process.env.CERTIFICADO_SENHA ?? '',
  },
  emitente: {
    cnpj: process.env.EMITENTE_CNPJ ?? '',
    razaoSocial: process.env.EMITENTE_RAZAO_SOCIAL ?? '',
    nomeFantasia: process.env.EMITENTE_NOME_FANTASIA ?? '',
    ie: process.env.EMITENTE_IE ?? 'ISENTO',
    // CRT 4 = Simples Nacional - MEI, código específico para MEI desde 01/04/2025
    // (Ajuste SINIEF 43/2023, NT 2024.001) — este projeto assume sempre emitente MEI.
    crt: parseInt(process.env.EMITENTE_CRT ?? '4', 10),
    logradouro: process.env.EMITENTE_LOGRADOURO ?? '',
    numero: process.env.EMITENTE_NUMERO ?? '',
    complemento: process.env.EMITENTE_COMPLEMENTO,
    bairro: process.env.EMITENTE_BAIRRO ?? '',
    municipio: process.env.EMITENTE_MUNICIPIO ?? '',
    codMunicipio: process.env.EMITENTE_COD_MUNICIPIO ?? '',
    uf: process.env.EMITENTE_UF ?? 'SP',
    cep: process.env.EMITENTE_CEP ?? '',
    telefone: process.env.EMITENTE_TELEFONE,
  },
  numeracao: {
    nfeSerie: parseInt(process.env.NFE_SERIE ?? '1', 10),
    nfceSerie: parseInt(process.env.NFCE_SERIE ?? '1', 10),
  },
  nfce: {
    // Credenciamento específico para emissão de NFC-e no portal da SEFAZ-SP, distinto
    // do certificado digital — necessário para montar o QR Code (grupo infNFeSupl).
    csc: process.env.NFCE_CSC ?? '',
    cscId: process.env.NFCE_CSC_ID ?? '',
  },
});
