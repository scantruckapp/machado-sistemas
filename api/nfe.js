export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { pedido } = req.body;

  const TOKEN = 'U1RnipPxGRxuyVBG2YgdKWNSZuvcdjDp'; // Homologação
  const CNPJ_EMITENTE = '40478144000172';

  // Determinar CFOP baseado no estado
  const cfop = pedido.cliente_uf === 'SC' ? '5102' : '6102';

  // Montar itens da NF
  const itens = pedido.kits.map((kit, i) => ({
    numero_item: i + 1,
    codigo_produto: `KIT${kit.tam}`,
    descricao: `Kit ${kit.tam} Balde${kit.tam > 1 ? 's' : ''} Automático ${kit.volt}`,
    ncm: '84248990',
    cfop: cfop,
    unidade_comercial: 'UN',
    quantidade_comercial: kit.qtd,
    valor_unitario_comercial: (pedido.totalFinal / pedido.kits.reduce((s,k)=>s+k.qtd,0)),
    valor_unitario_tributavel: (pedido.totalFinal / pedido.kits.reduce((s,k)=>s+k.qtd,0)),
    quantidade_tributavel: kit.qtd,
    unidade_tributavel: 'UN',
    valor_bruto: pedido.totalFinal,
    inclui_no_total: 1,
    icms_situacao_tributaria: '400',
    icms_origem: 0,
    pis_situacao_tributaria: '07',
    cofins_situacao_tributaria: '07',
  }));

  const nfeData = {
    natureza_operacao: 'Venda de mercadoria',
    forma_pagamento: 0,
    tipo_documento: 1,
    local_destino: pedido.cliente_uf === 'SC' ? 1 : 2,
    consumidor_final: 1,
    presenca_comprador: 2, // operação não presencial pela internet

    // Destinatário
    ...(pedido.cliente_cnpj?.length === 14 ? {
      cnpj_destinatario: pedido.cliente_cnpj,
    } : {
      cpf_destinatario: pedido.cliente_cnpj,
    }),
    nome_destinatario: pedido.cliente_razao,
    email_destinatario: pedido.cliente_email,
    logradouro_destinatario: pedido.cliente_logradouro,
    numero_destinatario: pedido.cliente_numero,
    bairro_destinatario: pedido.cliente_bairro,
    municipio_destinatario: pedido.cliente_cidade,
    uf_destinatario: pedido.cliente_uf,
    cep_destinatario: pedido.cliente_cep?.replace(/\D/g,''),
    telefone_destinatario: pedido.cliente_tel,
    indicador_inscricao_estadual_destinatario: pedido.cliente_ie ? 1 : 9,
    ...(pedido.cliente_ie ? { inscricao_estadual_destinatario: pedido.cliente_ie } : {}),

    // Itens
    items: itens,

    // Pagamento
    formas_pagamento: [{
      forma_pagamento: pedido.forma_pgto === 'pix' ? '17' : '01',
      valor_pagamento: pedido.totalFinal,
    }],

    // Frete
    modalidade_frete: 3, // sem frete
  };

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
