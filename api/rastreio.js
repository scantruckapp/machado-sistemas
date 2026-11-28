// ─────────────────────────────────────────────────────────────────────────────
// Rastreio automático: consulta os Correios e avisa o cliente no WhatsApp
// a cada nova etapa do envio.
//
// Chamadas:
//   GET /api/rastreio?chave=CRON_SECRET          → roda todos os pedidos em trânsito
//   GET /api/rastreio?chave=CRON_SECRET&teste=1  → mostra o que faria, sem mandar nada
//   GET /api/rastreio?id=123                     → atualiza só um pedido (botão no app;
//                                                  não manda WhatsApp)
//
// Variáveis de ambiente (Vercel → Settings → Environments → Production):
//   CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO, CORREIOS_CONTRATO
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
//   WHATSAPP_TEMPLATE (opcional, padrão: atualizacao_envio)
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   CRON_SECRET (qualquer senha longa, a mesma usada no agendamento do Supabase)
// ─────────────────────────────────────────────────────────────────────────────

const env = (k, padrao = '') => process.env[k] || padrao;
// A senha do agendamento pode estar como CRON_SECRET ou CRON_SECRET_KEY
const SENHA_CRON = () => env('CRON_SECRET') || env('CRON_SECRET_KEY');
const CORREIOS = 'https://api.correios.com.br';
const GRAPH = 'https://graph.facebook.com/v21.0';
const TEMPLATE = () => env('WHATSAPP_TEMPLATE', 'atualizacao_envio');

// ── Supabase ────────────────────────────────────────────────────────────────
const sb = async (path, opts = {}) => {
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: env('SUPABASE_SERVICE_KEY'),
      Authorization: `Bearer ${env('SUPABASE_SERVICE_KEY')}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};

// ── Correios: token (vale algumas horas; um por execução já basta) ─────────
let tokenCorreios = null;
let erroToken = null;
// O número cadastrado pode ser o do CONTRATO ou o do CARTÃO DE POSTAGEM.
// Tenta os dois jeitos (e por último só usuário + código de acesso).
async function obterToken() {
  if (tokenCorreios) return tokenCorreios;
  if (erroToken) throw erroToken;
  const basic = Buffer.from(`${env('CORREIOS_USUARIO')}:${env('CORREIOS_CODIGO_ACESSO')}`).toString('base64');
  // Cartão Correios Fácil 0079584047 · Contrato 9912718046 · SE/SC (DR 68)
  const cartao = String(env('CORREIOS_CARTAO') || env('CORREIOS_CONTRATO') || '0079584047').replace(/\D/g, '');
  const contrato = String(env('CORREIOS_NUMERO_CONTRATO', '9912718046')).replace(/\D/g, '');
  const dr = Number(env('CORREIOS_DR', '68'));
  const tentativas = [
    ['cartaopostagem', { numero: cartao }],
    ['contrato', { numero: contrato, dr }],
    ['', null],
  ];
  const msgs = [];
  for (const [tipo, corpo] of tentativas) {
    const r = await fetch(`${CORREIOS}/token/v1/autentica${tipo ? '/' + tipo : ''}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.token) { tokenCorreios = d.token; return tokenCorreios; }
    msgs.push(`${tipo || 'usuario'}: ${(d.msgs || [d.message || r.status]).join ? (d.msgs || [d.message || r.status]).join(' ') : d.msgs}`);
    await new Promise((ok) => setTimeout(ok, 400)); // limite de 3 pedidos de token por segundo
  }
  erroToken = new Error('Correios (token): ' + msgs.join(' | '));
  throw erroToken;
}

async function consultarCorreios(codigo) {
  const token = await obterToken();
  const r = await fetch(`${CORREIOS}/srorastro/v1/objetos/${encodeURIComponent(codigo)}?resultado=T`, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'pt-BR', Accept: 'application/json' },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Correios (rastro): ' + (d.msgs || d.message || r.status));
  const obj = (d.objetos || [])[0] || {};
  if (obj.mensagem && !obj.eventos) throw new Error('Correios: ' + obj.mensagem);
  // Eventos vêm do mais novo para o mais antigo; deixamos do mais antigo para o mais novo
  return (obj.eventos || []).map((e) => ({
    codigo: e.codigo || '',
    tipo: String(e.tipo || ''),
    descricao: e.descricao || '',
    detalhe: e.detalhe || '',
    data: e.dtHrCriado || '',
    cidade: e.unidade?.endereco?.cidade || '',
    uf: e.unidade?.endereco?.uf || '',
    destinoCidade: e.unidadeDestino?.endereco?.cidade || '',
    destinoUf: e.unidadeDestino?.endereco?.uf || '',
  })).reverse();
}

// ── Classifica cada evento numa etapa que vale avisar ──────────────────────
export function classificar(e) {
  const d = `${e.descricao} ${e.detalhe}`.toLowerCase();
  const bd = /^BD[EIR]$/.test(e.codigo);
  if ((bd && e.tipo.padStart(2, '0') === '01') || /entregue ao destinat/.test(d)) return 'entregue';
  if (/saiu para entrega/.test(d) || e.codigo === 'OEC') return 'saiu_entrega';
  if (/aguardando retirada|dispon[ií]vel para retirada/.test(d) || e.codigo === 'LDI') return 'retirada';
  if (bd || /n[aã]o entregue|ausente|endere[cç]o (incorreto|insuficiente|n[aã]o)|devolvid|recusad|extraviad|roubad|n[aã]o procurado/.test(d)) return 'problema';
  if (e.codigo === 'PO' || /postado/.test(d)) return 'postado';
  return 'transito';
}

const local = (e) => [e.cidade, e.uf].filter(Boolean).join('/') || 'Correios';
const TEXTO = {
  postado:      () => 'Seu pedido foi postado nos Correios ✅',
  transito:     (e) => `Seu pedido está a caminho 🚚${e.destinoCidade ? ` (indo para ${e.destinoCidade}/${e.destinoUf})` : ''}`,
  saiu_entrega: () => 'Seu pedido saiu para entrega hoje 🛵 Fique de olho!',
  retirada:     (e) => `Seu pedido está aguardando retirada na agência dos Correios 📬 ${e.detalhe || ''}`.trim(),
  entregue:     () => 'Seu pedido foi entregue! 🎉 Obrigado por comprar com a Machado Sistemas.',
  problema:     (e) => `Atenção: houve um problema na entrega ⚠️ ${e.descricao}${e.detalhe ? ' – ' + e.detalhe : ''}. Fale com a gente pelo WhatsApp (48) 99966-8902 que a gente te ajuda.`,
};
const chaveEvento = (e) => `${e.data}|${e.codigo}|${e.tipo}`;

// Telefone no formato do WhatsApp: 55 + DDD + número
export function telefoneWhats(tel) {
  let n = String(tel || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.replace(/^0+/, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return /^55\d{10,11}$/.test(n) ? n : null;
}

async function enviarWhats(numero, params) {
  const r = await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: TEMPLATE(),
        language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t).slice(0, 900) })) }],
      },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('WhatsApp: ' + (d.error?.message || r.status));
  return d.messages?.[0]?.id || '';
}

// ── Processa um pedido ─────────────────────────────────────────────────────
async function processar(p, { avisar, teste }) {
  const eventos = await consultarCorreios(p.rastreio.trim().toUpperCase());
  const res = { id: p.id, cliente: p.cliente, rastreio: p.rastreio, eventos: eventos.length, avisos: [] };
  const patch = { rastreio_eventos: eventos, rastreio_atualizado: new Date().toISOString() };

  const ultimo = eventos[eventos.length - 1];
  if (ultimo) {
    const etapaAtual = classificar(ultimo);
    patch.rastreio_etapa = etapaAtual;
    if (etapaAtual === 'entregue') patch.status_envio = 'entregue';
    else if (!p.status_envio || p.status_envio === 'aguardando') patch.status_envio = 'enviado';
  }

  if (avisar && eventos.length) {
    // Só eventos depois do último já avisado
    const ja = p.rastreio_avisado || '';
    let i = ja ? eventos.findIndex((e) => chaveEvento(e) === ja) + 1 : 0;
    if (i < 0) i = 0;
    const novos = eventos.slice(i);
    // Avisa uma vez por etapa (vários "em trânsito" seguidos viram um aviso só);
    // problemas são sempre avisados.
    let etapaAvisada = p.rastreio_etapa_avisada || '';
    const paraAvisar = [];
    for (const e of novos) {
      const et = classificar(e);
      if (et === 'problema' || et !== etapaAvisada) { paraAvisar.push(e); etapaAvisada = et; }
    }
    // Se ficaram vários pendentes (ex.: primeiro dia do robô), manda só o mais recente,
    // e só se for recente (até 48 h). Evento antigo é marcado como avisado, sem mandar.
    const recente = (e) => !e.data || (Date.now() - new Date(e.data).getTime()) < 48 * 3600e3;
    const ultimoPendente = paraAvisar[paraAvisar.length - 1];
    const envio = ultimoPendente && recente(ultimoPendente) ? [ultimoPendente] : [];
    if (ultimoPendente && !envio.length) res.avisos.push({ etapa: classificar(ultimoPendente), ignorado: 'etapa antiga (mais de 48 h), não avisado' });
    const numero = telefoneWhats(p.telefone);
    for (const e of envio) {
      const et = classificar(e);
      const params = [(p.cliente || 'cliente').split(' ')[0], TEXTO[et](e), local(e), p.rastreio];
      if (!numero) { res.avisos.push({ etapa: et, erro: `telefone inválido: "${p.telefone}"` }); continue; }
      if (teste) { res.avisos.push({ etapa: et, para: numero, mensagem: params }); continue; }
      try {
        const msgId = await enviarWhats(numero, params);
        res.avisos.push({ etapa: et, para: numero, ok: true, msgId });
      } catch (err) { res.avisos.push({ etapa: et, para: numero, erro: err.message }); }
    }
    const enviados = res.avisos.filter((a) => a.ok).length;
    if (!teste && (enviados || (novos.length && !envio.length))) {
      patch.rastreio_avisado = chaveEvento(novos[novos.length - 1]);
      patch.rastreio_etapa_avisada = classificar(novos[novos.length - 1]);
    }
  }

  if (!teste) await sb(`/pedidos?id=eq.${encodeURIComponent(p.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  res.etapa = patch.rastreio_etapa || '';
  return res;
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const faltando = ['CORREIOS_USUARIO', 'CORREIOS_CODIGO_ACESSO', 'CORREIOS_CONTRATO', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter((k) => !env(k));
  if (faltando.length) return res.status(500).json({ mensagem: 'Faltam variáveis na Vercel: ' + faltando.join(', ') });

  const campos = 'id,cliente,telefone,rastreio,status_envio,rastreio_avisado,rastreio_etapa_avisada';
  try {
    // Um pedido só (botão "Atualizar rastreio" no app) — não manda WhatsApp
    if (req.query.id) {
      const [p] = await sb(`/pedidos?id=eq.${encodeURIComponent(req.query.id)}&select=${campos}`, { headers: { Prefer: '' } }) || [];
      if (!p || !p.rastreio) return res.status(404).json({ mensagem: 'Pedido sem código de rastreio.' });
      const r = await processar(p, { avisar: false, teste: false });
      const [atual] = await sb(`/pedidos?id=eq.${encodeURIComponent(req.query.id)}&select=rastreio_eventos,rastreio_etapa,status_envio`, { headers: { Prefer: '' } });
      return res.status(200).json({ ...r, ...atual });
    }

    // Rodada completa (agendada) — protegida por senha
    if (!SENHA_CRON() || req.query.chave !== SENHA_CRON()) return res.status(401).json({ mensagem: 'Chave inválida.' });
    const teste = req.query.teste === '1';
    if (!teste && (!env('WHATSAPP_TOKEN') || !env('WHATSAPP_PHONE_ID'))) return res.status(500).json({ mensagem: 'Faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_ID na Vercel.' });

    const desde = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
    const lista = await sb(`/pedidos?select=${campos}&rastreio=neq.&or=(status_envio.is.null,status_envio.neq.entregue)&data_pedido=gte.${desde}&order=id.asc`, { headers: { Prefer: '' } }) || [];
    const resultados = [];
    for (const p of lista) {
      if (!p.rastreio || p.rastreio.trim().length < 13) continue;
      try { resultados.push(await processar(p, { avisar: true, teste })); }
      catch (err) { resultados.push({ id: p.id, cliente: p.cliente, rastreio: p.rastreio, erro: err.message }); }
    }
    return res.status(200).json({ teste, pedidos: resultados.length, resultados });
  } catch (err) {
    return res.status(500).json({ mensagem: err.message });
  }
}
