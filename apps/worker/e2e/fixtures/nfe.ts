// Gera XML de NF-e/NFC-e (layout RTC) para testes, a partir do exemplo oficial da calculadora
// (src/test/resources/xml/nfe/valido/nota/nfe_valido.xml), com datas, CNPJs e itens configuráveis.

export type ItemNFe = {
  ncm: string;
  cst: string;
  cClassTrib: string;
  vBC: number;
  pIBSUF: number;
  pIBSMun: number;
  pCBS: number;
  /** valores destacados pelo "ERP" */
  vIBSUF: number;
  vIBSMun: number;
  vCBS: number;
  qCom?: number;
  uCom?: string;
  /** grupo do Imposto Seletivo (opcional) */
  is?: { cst: string; cClassTrib: string; vBCIS: number; pIS: number; qTrib: number; uTrib: string; vIS: number };
};

export type OpcoesNFe = {
  chave: string; // 44 dígitos
  modelo?: "55" | "65";
  dhEmi: string;
  cMunFG: string;
  cnpjEmit: string;
  cnpjDest?: string;
  nNF?: string;
  serie?: string;
  itens: ItemNFe[];
};

const f2 = (n: number) => n.toFixed(2);
const f4 = (n: number) => n.toFixed(4);

function det(it: ItemNFe, n: number): string {
  const is = it.is
    ? `<IS><CSTIS>${it.is.cst}</CSTIS><cClassTribIS>${it.is.cClassTrib}</cClassTribIS><vBCIS>${f2(it.is.vBCIS)}</vBCIS>` +
      `<pIS>${f4(it.is.pIS)}</pIS><uTrib>${it.is.uTrib}</uTrib><qTrib>${f4(it.is.qTrib)}</qTrib><vIS>${f2(it.is.vIS)}</vIS></IS>`
    : "";
  return `<det nItem="${n}"><prod><cProd>${1000 + n}</cProd><cEAN>SEM GTIN</cEAN><xProd>ITEM ${n}</xProd><NCM>${it.ncm}</NCM>` +
    `<CFOP>5102</CFOP><uCom>${it.uCom ?? "UN"}</uCom><qCom>${f4(it.qCom ?? 1)}</qCom><vUnCom>${f2(it.vBC)}</vUnCom>` +
    `<vProd>${f2(it.vBC)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${it.uCom ?? "UN"}</uTrib><qTrib>${f4(it.qCom ?? 1)}</qTrib>` +
    `<vUnTrib>${f2(it.vBC)}</vUnTrib><indTot>1</indTot></prod><imposto>` +
    `<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>0.00</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS>` +
    `<PIS><PISNT><CST>09</CST></PISNT></PIS><COFINS><COFINSNT><CST>09</CST></COFINSNT></COFINS>${is}` +
    `<IBSCBS><CST>${it.cst}</CST><cClassTrib>${it.cClassTrib}</cClassTrib><gIBSCBS><vBC>${f2(it.vBC)}</vBC>` +
    `<gIBSUF><pIBSUF>${f4(it.pIBSUF)}</pIBSUF><vIBSUF>${f2(it.vIBSUF)}</vIBSUF></gIBSUF>` +
    `<gIBSMun><pIBSMun>${f4(it.pIBSMun)}</pIBSMun><vIBSMun>${f2(it.vIBSMun)}</vIBSMun></gIBSMun>` +
    `<vIBS>${f2(it.vIBSUF + it.vIBSMun)}</vIBS><gCBS><pCBS>${f4(it.pCBS)}</pCBS><vCBS>${f2(it.vCBS)}</vCBS></gCBS>` +
    `</gIBSCBS></IBSCBS></imposto></det>`;
}

/** <NFe> completa (sem envelope). */
export function nfe(o: OpcoesNFe): string {
  const soma = (k: "vBC" | "vIBSUF" | "vIBSMun" | "vCBS") => o.itens.reduce((s, i) => s + i[k], 0);
  const vIS = o.itens.reduce((s, i) => s + (i.is?.vIS ?? 0), 0);
  const dest = o.cnpjDest
    ? `<dest><CNPJ>${o.cnpjDest}</CNPJ><xNome>DESTINATARIO TESTE</xNome><enderDest><xLgr>RUA</xLgr><nro>1</nro>` +
      `<xBairro>CENTRO</xBairro><cMun>${o.cMunFG}</cMun><xMun>CIDADE</xMun><UF>RS</UF><CEP>90000000</CEP><cPais>1058</cPais>` +
      `<xPais>BRASIL</xPais></enderDest><indIEDest>9</indIEDest></dest>`
    : "";
  return `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${o.chave}" versao="4.00"><ide><cUF>${o.cMunFG.slice(0, 2)}</cUF>` +
    `<cNF>00000001</cNF><natOp>VENDA</natOp><mod>${o.modelo ?? "55"}</mod><serie>${o.serie ?? "1"}</serie><nNF>${o.nNF ?? "1"}</nNF>` +
    `<dhEmi>${o.dhEmi}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>${o.cMunFG}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis>` +
    `<cDV>${o.chave.slice(-1)}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><indIntermed>0</indIntermed>` +
    `<procEmi>0</procEmi><verProc>1.0</verProc></ide><emit><CNPJ>${o.cnpjEmit}</CNPJ><xNome>EMITENTE TESTE</xNome><enderEmit>` +
    `<xLgr>RUA</xLgr><nro>1</nro><xBairro>CENTRO</xBairro><cMun>${o.cMunFG}</cMun><xMun>CIDADE</xMun><UF>RS</UF><CEP>90000000</CEP>` +
    `<cPais>1058</cPais><xPais>Brasil</xPais></enderEmit><IE>1111111111</IE><CRT>3</CRT></emit>${dest}` +
    o.itens.map((it, i) => det(it, i + 1)).join("") +
    `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST>` +
    `<vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${f2(soma("vBC"))}</vProd><vFrete>0.00</vFrete>` +
    `<vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS>` +
    `<vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${f2(soma("vBC"))}</vNF></ICMSTot>` +
    (vIS ? `<ISTot><vIS>${f2(vIS)}</vIS></ISTot>` : "") +
    `<IBSCBSTot><vBCIBSCBS>${f2(soma("vBC"))}</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib>` +
    `<vIBSUF>${f2(soma("vIBSUF"))}</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>${f2(soma("vIBSMun"))}</vIBSMun>` +
    `</gIBSMun><vIBS>${f2(soma("vIBSUF") + soma("vIBSMun"))}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS>` +
    `<gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${f2(soma("vCBS"))}</vCBS><vCredPres>0.00</vCredPres>` +
    `<vCredPresCondSus>0.00</vCredPresCondSus></gCBS></IBSCBSTot></total><transp><modFrete>9</modFrete></transp>` +
    `<pag><detPag><tPag>01</tPag><vPag>${f2(soma("vBC"))}</vPag></detPag></pag></infNFe>${assinatura(o.chave)}</NFe>`;
}

/** Assinatura fictícia (o XSD exige o bloco; o conteúdo não é verificado). */
function assinatura(chave: string): string {
  return `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo>` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#NFe${chave}"><Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>gBeH9Soht1flizNz/WLUErbR2kM=</DigestValue>` +
    `</Reference></SignedInfo><SignatureValue>AAAA</SignatureValue><KeyInfo><X509Data><X509Certificate>AAAA</X509Certificate>` +
    `</X509Data></KeyInfo></Signature>`;
}

/** Nota autorizada (nfeProc), como o ERP/SEFAZ entrega. */
export function nfeProc(o: OpcoesNFe): string {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">${nfe(o)}` +
    `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${o.chave}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
}

/** Evento de cancelamento (deve ser ignorado com aviso). */
export function procEventoCancelamento(chave: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<evento versao="1.00"><infEvento><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;
}

/** Chave fictícia de 44 dígitos (UF 43, AAMM, CNPJ, mod, série, número). */
export function chaveTeste(cnpj: string, nNF: number, modelo = "55", aamm = "2703"): string {
  const base = `43${aamm}${cnpj}${modelo}001${String(nNF).padStart(9, "0")}1${String(nNF).padStart(8, "0")}`;
  return base + "0";
}

// Itens de teste (mesmos do docs/exemplos.md): arroz cesta básica (redução 100%) e cerveja com IS.
export const ARROZ: ItemNFe = {
  ncm: "10063021", cst: "200", cClassTrib: "200003", vBC: 100, qCom: 20, uCom: "KG",
  pIBSUF: 0.05, pIBSMun: 0.05, pCBS: 8.8,
  vIBSUF: 0, vIBSMun: 0, vCBS: 8.8, // ERP errou: ignorou a redução de 100% da CBS
};
export const CERVEJA: ItemNFe = {
  ncm: "22030000", cst: "000", cClassTrib: "000001", vBC: 165, qCom: 12, uCom: "LT",
  pIBSUF: 0.05, pIBSMun: 0.05, pCBS: 8.8,
  vIBSUF: 0.08, vIBSMun: 0.08, vCBS: 14.52,
  is: { cst: "000", cClassTrib: "000001", vBCIS: 150, pIS: 10, qTrib: 12, uTrib: "LT", vIS: 15 },
};
