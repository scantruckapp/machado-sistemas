export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Consulta status de NF-e existente
    const { ref } = req.query;
    const TOKEN = 'U1RnipPxGRxuyVBG2YgdKWNSZuvcdjDp';
    try {
      const response = await fetch(
        `https://homologacao.focusnfe.com.br/v2/nfe/${ref}`,
        {
          headers: {
            'Authorization': 'Basic ' + Buffer.from(TOKEN + ':').toString('base64'),
          },
        }
      );
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { pedido } = req.body;

  const TOKEN = 'U1RnipPxGRxuyVBG2YgdKWNSZuvcdjDp'; // Homologação
  const CNPJ_EMITENTE = '40478144000172';

  // ── CORREÇÃO 1: camelCase igual ao App.js ──────────────────────────────────
  const uf        = pedido.clienteUf   || pedido.cliente_uf  || 'SC';
  const cnpj      = (pedido.clienteCnpj || pedido.cliente_cnpj || '').replace(/\D/g, '');
  const razao     = pedido.clienteRazao || pedido.cliente_razao || '';
  const email     = pedido.clienteEmail || pedido.cliente_email || '';
  const cep       = (pedido.clienteCep  || pedido.cliente_cep  || '').replace(/\D/g, '');
  const logr      = pedido.clienteLogradouro || pedido.cliente_logradouro || '';
  const numero    = pedido.clienteNumero     || pedido.cliente_numero     || '';
  const bairro    = pedido.clienteBairro     || pedido.cliente_bairro     || '';
  const cidade    = pedido.clienteCidade     || pedido.cliente_cidade     || '';
  const ie        = pedido.clienteIe         || pedido.cliente_ie         || '';
  const formaPgto = pedido.formaPgto         || pedido.forma_pgto         || 'pix';
  // ──────────────────────────────────────────────────────────────────────────

  // CFOP correto baseado no UF real do cliente
  const cfop = uf.toUpperCase() === 'SC' ? '5102' : '6102';

  // Calcula total de quantidade para rateio de valor unitário
  const totalQtd = pedido.kits.reduce((s, k) => s + (k.qtd || 1), 0);

  const itens = pedido.kits.map((kit, i) => {
    const valorUnit = Number((pedido.totalFinal / totalQtd).toFixed(2));
    const valorBruto = Number((valorUnit * (kit.qtd || 1)).toFixed(2));
    return {
      numero_item: i + 1,
      codigo_produto: `KIT${kit.tam}`,
      descricao: `Kit ${kit.tam} Balde${kit.tam > 1 ? 's' : ''} Automatico ${kit.volt || '220v'}`,
      ncm: '84248990',
      cfop: cfop,
      unidade_comercial: 'UN',
      quantidade_comercial: kit.qtd || 1,
      valor_unitario_comercial: valorUnit,
      valor_unitario_tributavel: valorUnit,
      quantidade_tributavel: kit.qtd || 1,
      unidade_tributavel: 'UN',
      valor_bruto: valorBruto,
      inclui_no_total: 1,
      icms_situacao_tributaria: '400',
      icms_origem: 0,
      pis_situacao_tributaria: '07',
      cofins_situacao_tributaria: '07',
    };
  });

  // ── CORREÇÃO 2: emitente explícito no body ─────────────────────────────────
  const nfeData = {
    // EMITENTE — obrigatório em homologação via API
    cnpj_emitente: CNPJ_EMITENTE,

    natureza_operacao: 'Venda de mercadoria',
    forma_pagamento: 0,
    tipo_documento: 1,
    local_destino: uf.toUpperCase() === 'SC' ? 1 : 2,
    consumidor_final: 1,
    presenca_comprador: 2,

    // Destinatário — CPF (11 dígitos) ou CNPJ (14 dígitos)
    ...(cnpj.length === 14
      ? { cnpj_destinatario: cnpj }
      : { cpf_destinatario: cnpj }),
    nome_destinatario: razao,
    email_destinatario: email,
    logradouro_destinatario: logr,
    numero_destinatario: numero,
    bairro_destinatario: bairro,
    municipio_destinatario: cidade,
    uf_destinatario: uf.toUpperCase(),
    cep_destinatario: cep,
    indicador_inscricao_estadual_destinatario: ie ? 1 : 9,
    ...(ie ? { inscricao_estadual_destinatario: ie } : {}),

    items: itens,

    formas_pagamento: [{
      forma_pagamento: formaPgto === 'pix' ? '17' : formaPgto === 'cartao' ? '03' : '01',
      valor_pagamento: pedido.totalFinal,
    }],

    modalidade_frete: 3,
  };
  // ──────────────────────────────────────────────────────────────────────────

  try {
    const response = await fetch(
      `https://homologacao.focusnfe.com.br/v2/nfe?ref=${pedido.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(TOKEN + ':').toString('base64'),
        },
        body: JSON.stringify(nfeData),
      }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
