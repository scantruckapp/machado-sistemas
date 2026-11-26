// Token da Focus NFe: fica nas variáveis de ambiente da Vercel (FOCUS_NFE_TOKEN),
// nunca no código — o repositório é público.
const TOKEN = process.env.FOCUS_NFE_TOKEN;
const CNPJ_EMITENTE = '40478144000172';
const FOCUS = 'https://api.focusnfe.com.br/v2/nfe';
const auth = () => ({ 'Authorization': 'Basic ' + Buffer.from(TOKEN + ':').toString('base64') });

// Data de emissão (Vercel roda em UTC, -00:00 evita rejeição 703)
const dataAgora = () => {
  const agora = new Date(Date.now() - 10 * 60 * 1000);
  const pad = (n) => String(n).padStart(2,'0');
  return agora.getUTCFullYear() + '-' + pad(agora.getUTCMonth()+1) + '-' + pad(agora.getUTCDate()) + 'T' + pad(agora.getUTCHours()) + ':' + pad(agora.getUTCMinutes()) + ':' + pad(agora.getUTCSeconds()) + '-00:00';
};

const responder = async (res, response, extra = {}) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({
      mensagem: data.mensagem || JSON.stringify(data),
      erros:    data.erros    || [],
      erro:     JSON.stringify(data),
    });
  }
  return res.status(response.status).json({ ...data, ...extra });
};

// Monta o JSON da nota (venda ou devolução) a partir do pedido
function montarNota(pedido, opc = {}) {
  const dev = !!opc.devolucao;

  // ── Normaliza campos (camelCase e snake_case) ────────────────────────────
  const uf        = (pedido.clienteUf        || pedido.cliente_uf        || 'SC').toUpperCase();
  const cnpj      = (pedido.clienteCnpj      || pedido.cliente_cnpj      || '').replace(/\D/g,'');
  const razao     = pedido.clienteRazao      || pedido.cliente_razao     || '';
  const email     = pedido.clienteEmail      || pedido.cliente_email     || '';
  const cep       = (pedido.clienteCep       || pedido.cliente_cep       || '').replace(/\D/g,'');
  const logr      = pedido.clienteLogradouro || pedido.cliente_logradouro|| '';
  const numero    = String(pedido.clienteNumero || pedido.cliente_numero || 'S/N');
  const bairro    = pedido.clienteBairro     || pedido.cliente_bairro    || '';
  const cidade    = pedido.clienteCidade     || pedido.cliente_cidade    || '';
  const ie        = pedido.clienteIe         || pedido.cliente_ie        || '';
  const formaPgto = pedido.formaPgto         || pedido.forma_pgto        || 'pix';

  // Venda: 5102/6102. Devolução de venda (entrada): 1202/2202
  const cfop = dev ? (uf === 'SC' ? '1202' : '2202') : (uf === 'SC' ? '5102' : '6102');

  const dataEmissao = dataAgora();

  // ── Itens ─────────────────────────────────────────────────────────────────
  // Suporte a NF-e avulsa com valor e descrição customizados
  const isAvulsa = !!pedido.avulsa;
  const valorAvulso = pedido.valorAvulso || pedido.totalFinal;
  const descAvulsa = pedido.descricaoAvulsa || 'Kit Automatico';

  const itens = isAvulsa ? [{
    numero_item:               1,
    codigo_produto:            'AVULSO',
    descricao:                 descAvulsa,
    codigo_ncm:                '84248990',
    cfop:                      cfop,
    unidade_comercial:         'UN',
    quantidade_comercial:      1,
    valor_unitario_comercial:  Number(valorAvulso.toFixed(2)),
    valor_unitario_tributavel: Number(valorAvulso.toFixed(2)),
    quantidade_tributavel:     1,
    unidade_tributavel:        'UN',
    valor_bruto:               Number(valorAvulso.toFixed(2)),
    inclui_no_total:           1,
    icms_situacao_tributaria:  '400',
    icms_origem:               0,
    pis_situacao_tributaria:   '07',
    cofins_situacao_tributaria:'07',
  }] : pedido.kits.map((kit, i) => {
    const totalQtd = pedido.kits.reduce((s,k)=>s+(Number(k.qtd)||1),0);
    const preco = Number((pedido.totalFinal / totalQtd).toFixed(2));
    const qtd   = Number(kit.qtd) || 1;
    return {
      numero_item:               i + 1,
      codigo_produto:            `KIT${kit.tam}`,
      descricao:                 `Kit ${kit.tam} Balde${kit.tam > 1 ? 's' : ''} Automatico ${kit.volt || '220v'}`,
      codigo_ncm:                '84248990',
      cfop:                      cfop,
      unidade_comercial:         'UN',
      quantidade_comercial:      qtd,
      valor_unitario_comercial:  Number(preco.toFixed(2)),
      valor_unitario_tributavel: Number(preco.toFixed(2)),
      quantidade_tributavel:     qtd,
      unidade_tributavel:        'UN',
      valor_bruto:               Number((preco * qtd).toFixed(2)),
      inclui_no_total:           1,
      icms_situacao_tributaria:  '400',
      icms_origem:               0,
      pis_situacao_tributaria:   '07',
      cofins_situacao_tributaria:'07',
    };
  });

  // ── Forma de pagamento ────────────────────────────────────────────────────
  const pgtoMap = { pix: '17', cartao: '03', boleto: '01' };
  const pgtoCode = pgtoMap[formaPgto] || '17';

  // ── Destinatário ──────────────────────────────────────────────────────────
  const destDoc = cnpj.length === 14
    ? { cnpj_destinatario: cnpj }
    : { cpf_destinatario:  cnpj };
  // IE: 1=contribuinte (CNPJ+IE), 9=nao contribuinte/CPF sem IE
  const indIE = (cnpj.length === 14 && ie && ie.trim()) ? 1 : 9;

  const nfeData = {
    cnpj_emitente:              CNPJ_EMITENTE,
    data_emissao:               dataEmissao,
    data_saida_entrada:         dataEmissao,
    natureza_operacao:          dev ? 'Devolucao de venda' : 'Venda de mercadoria',
    ...(dev ? {} : { forma_pagamento: 0 }),
    tipo_documento:             dev ? 0 : 1,   // 0 = entrada (a mercadoria volta), 1 = saída
    local_destino:              uf === 'SC' ? 1 : 2,
    consumidor_final:           1,
    presenca_comprador:         2,
    ...destDoc,
    nome_destinatario:          razao,
    logradouro_destinatario:    logr,
    numero_destinatario:        numero,
    bairro_destinatario:        bairro,
    municipio_destinatario:     cidade,
    uf_destinatario:            uf,
    cep_destinatario:           cep,
    ...(email ? { email_destinatario: email } : {}),
    indicador_inscricao_estadual_destinatario: indIE,
    ...(ie && indIE === 1 ? { inscricao_estadual_destinatario: ie } : {}),
    items: itens,
    formas_pagamento: dev
      ? [{ forma_pagamento: '90', valor_pagamento: 0 }]   // 90 = sem pagamento
      : [{ forma_pagamento: pgtoCode, valor_pagamento: Number(pedido.totalFinal.toFixed(2)) }],
    modalidade_frete:   dev ? 9 : 3,
    finalidade_emissao: dev ? 4 : 1,               // 4 = devolução
    ...(dev ? { notas_referenciadas: [{ chave_nfe: opc.chaveOriginal }] } : {}),
  };
  return nfeData;

}

export default async function handler(req, res) {
  if (!TOKEN) {
    return res.status(500).json({ mensagem: 'Token da Focus NFe não configurado. Cadastre FOCUS_NFE_TOKEN nas variáveis de ambiente da Vercel.' });
  }

  // ── GET: consulta status ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { ref } = req.query;
    try {
      const response = await fetch(`${FOCUS}/${encodeURIComponent(ref)}`, { headers: auth() });
      return res.status(response.status).json(await response.json());
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE: cancela a NF-e na SEFAZ (prazo: até 24 h após a autorização) ──
  if (req.method === 'DELETE') {
    const { ref, justificativa } = req.body || {};
    if (!ref) return res.status(400).json({ mensagem: 'Informe a referência (ref) da nota.' });
    const just = String(justificativa || '').trim();
    if (just.length < 15 || just.length > 255) {
      return res.status(400).json({ mensagem: 'A justificativa precisa ter entre 15 e 255 caracteres.' });
    }
    try {
      const response = await fetch(`${FOCUS}/${encodeURIComponent(ref)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ justificativa: just }),
      });
      return responder(res, response);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { pedido } = req.body;

  // ── Devolução: NF-e de entrada referenciando a nota original ─────────────
  if (req.body.acao === 'devolucao') {
    const { ref, refDevolucao } = req.body;
    if (!ref || !refDevolucao || !pedido) return res.status(400).json({ mensagem: 'Informe o pedido, a nota original (ref) e a referência da devolução.' });
    try {
      const r0 = await fetch(`${FOCUS}/${encodeURIComponent(ref)}`, { headers: auth() });
      const orig = await r0.json();
      if (!r0.ok) return res.status(r0.status).json({ mensagem: 'Não encontrei a nota original: ' + (orig.mensagem || r0.status) });
      if (orig.status !== 'autorizado' || !orig.chave_nfe) return res.status(400).json({ mensagem: `A nota original está "${orig.status}". Só dá para fazer devolução de uma nota autorizada.` });
      const nfeDev = montarNota(pedido, { devolucao: true, chaveOriginal: orig.chave_nfe });
      const response = await fetch(`${FOCUS}?ref=${encodeURIComponent(refDevolucao)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(nfeDev),
      });
      return responder(res, response, { ref: refDevolucao });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const nfeData = montarNota(pedido);

  // Ref único por emissão — evita erro 539 de duplicidade
  const nfeRef = `prod_${pedido.id}_${Date.now()}`;

  try {
    const response = await fetch(
      `https://api.focusnfe.com.br/v2/nfe?ref=${nfeRef}`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Basic ' + Buffer.from(TOKEN + ':').toString('base64'),
        },
        body: JSON.stringify(nfeData),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        mensagem: data.mensagem || JSON.stringify(data),
        erros:    data.erros    || [],
        erro:     JSON.stringify(data),
      });
    }

    // Inclui o ref na resposta para o frontend poder consultar depois
    return res.status(response.status).json({ ...data, ref: nfeRef });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
