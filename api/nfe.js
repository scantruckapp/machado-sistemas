export default async function handler(req, res) {
  // ── GET: consulta status ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { ref } = req.query;
    const TOKEN = 'U1RnipPxGRxuyVBG2YgdKWNSZuvcdjDp';
    try {
      const response = await fetch(
        `https://homologacao.focusnfe.com.br/v2/nfe/${ref}`,
        { headers: { 'Authorization': 'Basic ' + Buffer.from(TOKEN + ':').toString('base64') } }
      );
      return res.status(response.status).json(await response.json());
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { pedido } = req.body;
  const TOKEN = 'U1RnipPxGRxuyVBG2YgdKWNSZuvcdjDp';
  const CNPJ_EMITENTE = '40478144000172';

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

  const cfop = uf === 'SC' ? '5102' : '6102';

  // ── Data de emissão no fuso de Brasília ──────────────────────────────────
  // Vercel roda em UTC. Subtraimos 10min para evitar rejeicao 703 (data futura).
  const agora = new Date(Date.now() - 10 * 60 * 1000);
  const pad = (n) => String(n).padStart(2,'0');
  // Usa UTC puro (sem offset) — Vercel roda em UTC, offset -03:00 causava rejeicao 703  
  const dataEmissao = agora.getUTCFullYear() + '-' + pad(agora.getUTCMonth()+1) + '-' + pad(agora.getUTCDate()) + 'T' + pad(agora.getUTCHours()) + ':' + pad(agora.getUTCMinutes()) + ':' + pad(agora.getUTCSeconds()) + '-00:00';

  // ── Itens: cada kit vira um item, valor unitário pelo preço do kit ────────
  const PRECOS = { 1:1350, 2:1850, 3:2350, 4:2650, 5:2950, 6:3250 };
  const itens = pedido.kits.map((kit, i) => {
    // Usa totalFinal para que soma dos itens bata com valor_pagamento
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

  // ── Destinatário: CPF = 11 dígitos, CNPJ = 14 ────────────────────────────
  const destDoc = cnpj.length === 14
    ? { cnpj_destinatario: cnpj }
    : { cpf_destinatario:  cnpj };

  // ── IE: 1=contribuinte, 9=não contribuinte/CPF ───────────────────────────
  const indIE = (ie && cnpj.length === 14) ? 1 : 9;

  const nfeData = {
    cnpj_emitente:              CNPJ_EMITENTE,
    data_emissao:               dataEmissao,
    data_saida_entrada:         dataEmissao,
    natureza_operacao:          'Venda de mercadoria',
    forma_pagamento:            0,
    tipo_documento:             1,
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
    formas_pagamento: [{
      forma_pagamento:  pgtoCode,
      valor_pagamento:  Number(pedido.totalFinal.toFixed(2)),
    }],
    modalidade_frete: 3,
    finalidade_emissao: 1,
  };

  try {
    const response = await fetch(
      `https://homologacao.focusnfe.com.br/v2/nfe?ref=${pedido.id}`,
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

    // Retorna detalhes completos para facilitar debug
    if (!response.ok) {
      return res.status(response.status).json({
        mensagem: data.mensagem || JSON.stringify(data),
        erros:    data.erros    || [],
        erro:     JSON.stringify(data),
      });
    }

    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
