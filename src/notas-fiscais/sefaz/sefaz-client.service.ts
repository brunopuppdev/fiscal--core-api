import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';
import { AppConfig } from '../../config/configuration';
import { getSefazEndpoints } from '../../config/sefaz-endpoints';
import { CertificadoService } from '../../certificado/certificado.service';
import { CODIGO_UF } from '../../common/utils/chave-acesso.util';
import { montarEnvelopeSoap } from './soap-envelope.util';
import { postSoap } from './soap-http.util';

export interface RetornoAutorizacao {
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  autorizada: boolean;
  xmlProtocolo?: string;
}

export interface RetornoStatusServico {
  cStat: string;
  xMotivo: string;
  emOperacao: boolean;
}

type NoXml = Record<string, unknown>;

const NS = {
  status: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4',
  autorizacao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4',
  retAutorizacao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4',
  consultaProtocolo:
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4',
};

function texto(valor: unknown, padrao = ''): string {
  if (valor === undefined || valor === null) return padrao;
  if (
    typeof valor === 'string' ||
    typeof valor === 'number' ||
    typeof valor === 'boolean'
  ) {
    return String(valor);
  }
  return padrao;
}

function objeto(valor: unknown): NoXml | undefined {
  return valor && typeof valor === 'object' ? (valor as NoXml) : undefined;
}

/**
 * Cliente SOAP para os webservices da SEFAZ-SP (NF-e/NFC-e layout 4.00).
 *
 * ATENÇÃO: comunicação direta com a SEFAZ é sensível a detalhes que só se confirmam
 * testando de verdade contra o ambiente de homologação (URLs podem mudar de versão,
 * SP pode operar em lote assíncrono ou síncrono dependendo do serviço). Valide as
 * respostas reais antes de considerar este cliente pronto para produção.
 */
@Injectable()
export class SefazClientService {
  private readonly parser = new XMLParser({ ignoreAttributes: false });

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly certificadoService: CertificadoService,
  ) {}

  private endpoints() {
    const { uf, ambiente } = this.configService.get('sefaz', { infer: true });
    return { ...getSefazEndpoints(uf, ambiente), uf, ambiente };
  }

  async consultarStatusServico(): Promise<RetornoStatusServico> {
    const { NFeStatusServico4, uf, ambiente } = this.endpoints();
    const cUF = CODIGO_UF[uf.toUpperCase()] ?? '35';

    const corpo =
      `<consStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>${ambiente}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;

    const envelope = montarEnvelopeSoap(NS.status, corpo);
    const resposta = await postSoap(
      NFeStatusServico4,
      NS.status,
      envelope,
      this.certificadoService.obterHttpsAgent(),
    );

    const ret = this.buscarProfundo(
      this.parser.parse(resposta),
      'retConsStatServ',
    );
    if (!ret) {
      throw new ServiceUnavailableException(
        'Resposta inesperada da SEFAZ ao consultar status do serviço.',
      );
    }

    const cStat = texto(ret.cStat);
    return {
      cStat,
      xMotivo: texto(ret.xMotivo),
      emOperacao: cStat === '107',
    };
  }

  /**
   * Envia a NFe assinada para autorização em lote síncrono (indSinc=1) — adequado
   * para o baixo volume de um MEI. idLote é apenas um identificador local do envio.
   */
  async autorizar(
    xmlNfeAssinado: string,
    idLote: number,
  ): Promise<RetornoAutorizacao> {
    const { NFeAutorizacao4 } = this.endpoints();

    const corpo =
      `<enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<idLote>${idLote}</idLote><indSinc>1</indSinc>${xmlNfeAssinado}</enviNFe>`;

    const envelope = montarEnvelopeSoap(NS.autorizacao, corpo);
    const resposta = await postSoap(
      NFeAutorizacao4,
      NS.autorizacao,
      envelope,
      this.certificadoService.obterHttpsAgent(),
    );

    const ret = this.buscarProfundo(this.parser.parse(resposta), 'retEnviNFe');
    if (!ret) {
      throw new ServiceUnavailableException(
        'Resposta inesperada da SEFAZ ao autorizar a NF-e.',
      );
    }

    const infProt = objeto(objeto(ret.protNFe)?.infProt);

    if (infProt) {
      const cStat = texto(infProt.cStat);
      return {
        cStat,
        xMotivo: texto(infProt.xMotivo),
        protocolo:
          infProt.nProt !== undefined ? texto(infProt.nProt) : undefined,
        autorizada: cStat === '100',
        xmlProtocolo: this.montarXmlProtNfe(infProt),
      };
    }

    // Lote recebido mas ainda não processado (cStat 103/105) — seria necessário
    // consultar depois via NFeRetAutorizacao4 (não implementado aqui por não se
    // aplicar ao fluxo síncrono padrão, mas fica registrado para evolução).
    return {
      cStat: texto(ret.cStat),
      xMotivo: texto(ret.xMotivo),
      autorizada: false,
    };
  }

  async consultarProtocolo(chaveAcesso: string): Promise<RetornoAutorizacao> {
    const { NFeConsultaProtocolo4, ambiente } = this.endpoints();

    const corpo =
      `<consSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>${ambiente}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chaveAcesso}</chNFe></consSitNFe>`;

    const envelope = montarEnvelopeSoap(NS.consultaProtocolo, corpo);
    const resposta = await postSoap(
      NFeConsultaProtocolo4,
      NS.consultaProtocolo,
      envelope,
      this.certificadoService.obterHttpsAgent(),
    );

    const ret = this.buscarProfundo(
      this.parser.parse(resposta),
      'retConsSitNFe',
    );
    const infProt = objeto(objeto(ret?.protNFe)?.infProt);

    if (!infProt) {
      return {
        cStat: texto(ret?.cStat),
        xMotivo: texto(ret?.xMotivo, 'Sem retorno da SEFAZ'),
        autorizada: false,
      };
    }

    const cStat = texto(infProt.cStat);
    return {
      cStat,
      xMotivo: texto(infProt.xMotivo),
      protocolo: infProt.nProt !== undefined ? texto(infProt.nProt) : undefined,
      autorizada: cStat === '100',
      xmlProtocolo: this.montarXmlProtNfe(infProt),
    };
  }

  private montarXmlProtNfe(infProt: NoXml): string {
    const campos = Object.entries(infProt)
      .filter(([chave]) => !chave.startsWith('@_'))
      .map(([chave, valor]) => `<${chave}>${texto(valor)}</${chave}>`)
      .join('');
    return `<protNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><infProt>${campos}</infProt></protNFe>`;
  }

  /** Busca recursiva por uma chave em um objeto já parseado do XML (independe de prefixo de namespace). */
  private buscarProfundo(valor: unknown, chave: string): NoXml | null {
    const obj = objeto(valor);
    if (!obj) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (k === chave || k.endsWith(`:${chave}`)) {
        return objeto(v) ?? null;
      }
      const achado = this.buscarProfundo(v, chave);
      if (achado) return achado;
    }
    return null;
  }
}
