import { useState, useEffect } from "react";

const USUARIOS = {
  felipe: { senha: "felipe123", nome: "Felipe", role: "admin" },
  yasmin: { senha: "yasmin123", nome: "Yasmin", role: "vendedora" },
};

const PRECOS_KIT = { 1: 1350, 2: 1850, 3: 2350, 4: 2650, 5: 2950, 6: 3250 };

const STATUS_FIN = {
  pendente: { label: "Pendente", cor: "#EF4444" },
  parcial: { label: "Parcial", cor: "#F59E0B" },
  quitado: { label: "Quitado", cor: "#10B981" },
};

const STATUS_ENV = {
  aguardando: { label: "Aguardando envio", cor: "#6B7280" },
  enviado: { label: "Enviado", cor: "#3B82F6" },
  entregue: { label: "Entregue", cor: "#10B981" },
};

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://vxkqmrsdpjtoduezqocl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4a3FtcnNkcGp0b2R1ZXpxb2NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTI5MjksImV4cCI6MjEwMTMyODkyOX0.1ni6hBFqJme1mspQ2pY0aBb-vZc_frv4NXkO3Xzvkrk";

const sbFetch = async (path, opts={}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers||{}),
    },
  });
  if(!r.ok) { const e = await r.text(); throw new Error(e); }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
};

const carregarDados = async () => {
  try {
    const rows = await sbFetch("/pedidos?order=criado_em.desc");
    return rows.map(r => ({
      id: r.id,
      cliente: r.cliente,
      telefone: r.telefone,
      dataPedido: r.data_pedido,
      dataEnvio: r.data_envio,
      kits: r.kits || [],
      desconto: r.desconto,
      subtotal: r.subtotal,
      descVal: r.desc_val,
      totalFinal: r.total_final,
      obs: r.obs,
      vendedor: r.vendedor,
      entradas: r.entradas || [],
      statusEnvio: r.status_envio,
      rastreio: r.rastreio,
      frete: r.frete,
      criadoEm: r.criado_em,
    }));
  } catch(e) {
    console.error("Erro ao carregar:", e);
    const b = localStorage.getItem("pedidos_ms");
    return b ? JSON.parse(b) : [];
  }
};

const salvarPedido = async (p) => {
  const row = {
    id: p.id,
    cliente: p.cliente,
    telefone: p.telefone,
    data_pedido: p.dataPedido,
    data_envio: p.dataEnvio,
    kits: p.kits,
    desconto: p.desconto,
    subtotal: p.subtotal,
    desc_val: p.descVal,
    total_final: p.totalFinal,
    obs: p.obs,
    vendedor: p.vendedor,
    entradas: p.entradas,
    status_envio: p.statusEnvio,
    rastreio: p.rastreio,
    frete: p.frete,
    criado_em: p.criadoEm,
  };
  await sbFetch("/pedidos", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
};

const salvarDados = async (pedidos) => {
  try {
    await Promise.all(pedidos.map(p => salvarPedido(p)));
    localStorage.setItem("pedidos_ms", JSON.stringify(pedidos));
  } catch(e) {
    console.error("Erro ao salvar:", e);
    localStorage.setItem("pedidos_ms", JSON.stringify(pedidos));
  }
};

const fmt = (v) => `R$ ${Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}`;
const fmtD = (d) => d ? new Date(d+"T00:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2);

const dias15Uteis = (inicio) => {
  const d = new Date(inicio+"T00:00:00");
  let u = 0;
  while (u < 15) { d.setDate(d.getDate()+1); if(d.getDay()!==0&&d.getDay()!==6) u++; }
  return d.toISOString().split("T")[0];
};

const calcKit = (kits, desc) => {
  const sub = kits.reduce((s,k)=>s+(PRECOS_KIT[k.tam]||0)*(k.qtd||1),0);
  const dv = sub*((desc||0)/100);
  return {sub, dv, total: sub-dv};
};

const sfin = (p) => {
  const pago = (p.entradas||[]).reduce((s,e)=>s+(e.valor||0),0);
  if(pago<=0) return "pendente";
  if(pago>=p.totalFinal) return "quitado";
  return "parcial";
};

// ESTILOS BASE
const S = {
  bg: "#0D1117", card: "#1E2530", card2: "#141A22",
  verde: "#00C896", txt: "#F1F5F9", sub: "#9CA3AF", dim: "#6B7280",
  borda: "#2D3748",
};

const Card = ({children, style={}}) => (
  <div style={{background:S.card, borderRadius:16, padding:18, marginBottom:14, ...style}}>{children}</div>
);

const Badge = ({label, cor}) => (
  <span style={{background:cor+"22",color:cor,padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{label}</span>
);

const Btn = ({children, onClick, v="primary", sz="md", full=false, disabled=false}) => {
  const cores = {
    primary:{bg:S.verde,color:"#0D1117"},
    secondary:{bg:"#2D3748",color:S.txt},
    danger:{bg:"#EF444422",color:"#EF4444"},
    ghost:{bg:"transparent",color:S.sub},
  };
  const sizes = {sm:{p:"7px 14px",fs:13}, md:{p:"11px 22px",fs:14}, lg:{p:"15px 0",fs:16}};
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background:cores[v].bg, color:cores[v].color,
      padding:sizes[sz].p, fontSize:sizes[sz].fs,
      border:"none", borderRadius:12, fontWeight:700,
      cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.5:1, width:full?"100%":"auto",
    }}>{children}</button>
  );
};

const Campo = ({label, value, onChange, type="text", placeholder=""}) => (
  <div style={{marginBottom:13}}>
    {label && <div style={{fontSize:12,color:S.sub,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>}
    <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:"100%",background:S.card2,border:"1px solid "+S.borda,borderRadius:10,padding:"11px 14px",color:S.txt,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
  </div>
);

const Sel = ({label, value, onChange, opts}) => (
  <div style={{marginBottom:13}}>
    {label && <div style={{fontSize:12,color:S.sub,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>}
    <select value={value||""} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:S.card2,border:"1px solid "+S.borda,borderRadius:10,padding:"11px 14px",color:S.txt,fontSize:14,boxSizing:"border-box"}}>
      {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  </div>
);

// ── TELA LOGIN ────────────────────────────────────────────────────────────────
function Login({onLogin}) {
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [erro, setErro] = useState("");

  const entrar = () => {
    const u = USUARIOS[usr.trim().toLowerCase()];
    if(u && u.senha === pwd.trim()) {
      onLogin({usuario: usr.trim().toLowerCase(), ...u});
    } else {
      setErro("Usuário ou senha incorretos");
    }
  };

  return (
    <div style={{minHeight:"100vh",background:S.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:52,marginBottom:8}}>🪣</div>
          <div style={{fontSize:26,fontWeight:900,color:S.verde,letterSpacing:-1}}>MACHADO SISTEMAS</div>
          <div style={{fontSize:13,color:S.dim,marginTop:4}}>Gestão de Pedidos</div>
        </div>
        <Card>
          <Campo label="Usuário" value={usr} onChange={setUsr} placeholder="felipe ou yasmin"/>
          <Campo label="Senha" value={pwd} onChange={setPwd} type="password" placeholder="••••••••"/>
          {erro && <div style={{color:"#EF4444",fontSize:13,marginBottom:12,textAlign:"center"}}>{erro}</div>}
          <Btn onClick={entrar} v="primary" sz="lg" full>Entrar</Btn>
        </Card>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:S.dim}}>
          Usuário: <b style={{color:S.sub}}>felipe</b> ou <b style={{color:S.sub}}>yasmin</b> (minúsculo)
        </div>
      </div>
    </div>
  );
}

// ── FORM PEDIDO ───────────────────────────────────────────────────────────────
function FormPedido({usuario, pedidoInicial, onSalvar, onCancelar}) {
  const ed = pedidoInicial || {};
  const dp = ed.dataPedido || hoje();
  const [cliente, setCliente] = useState(ed.cliente||"");
  const [tel, setTel] = useState(ed.telefone||"");
  const [dataPedido, setDataPedido] = useState(dp);
  const [dataEnvio, setDataEnvio] = useState(ed.dataEnvio||dias15Uteis(dp));
  const [kits, setKits] = useState(ed.kits||[{tam:4,qtd:1,volt:"220v"}]);
  const [desc, setDesc] = useState(ed.desconto||0);
  const [obs, setObs] = useState(ed.obs||"");
  const [entradaValor, setEntradaValor] = useState("");
  const [comprovante, setComprovante] = useState(null);
  const [analisando, setAnalisando] = useState(false);

  const toBase64 = (file) => new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const analisarComprovante = async (file) => {
    if(!file) return;
    setAnalisando(true);
    try {
      const b64 = await toBase64(file);
      const resp = await fetch("/api/analisar",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({image:b64, mediaType:file.type, tipo:"pagamento"})
      });
      const parsed = await resp.json();
      if(parsed.valor) setEntradaValor(String(parsed.valor));
    } catch(e) { alert("Não consegui ler o valor. Digite manualmente."); }
    setAnalisando(false);
  };

  const addKit = () => setKits([...kits,{tam:4,qtd:1,volt:"220v"}]);
  const remKit = (i) => setKits(kits.filter((_,x)=>x!==i));
  const updKit = (i,c,v) => setKits(kits.map((k,x)=>x===i?{...k,[c]:c==="tam"||c==="qtd"?Number(v):v}:k));
  const onDataPedido = (v) => { setDataPedido(v); setDataEnvio(dias15Uteis(v)); };

  const {sub, dv, total} = calcKit(kits, desc);

  const salvar = () => {
    if(!cliente.trim()) return alert("Informe o nome do cliente!");
    if(!tel.trim()) return alert("Informe o telefone!");
    onSalvar({
      id: ed.id||uid(),
      cliente: cliente.trim(), telefone: tel.trim(),
      dataPedido, dataEnvio, kits, desconto: Number(desc),
      subtotal: sub, descVal: dv, totalFinal: total, obs,
      vendedor: ed.vendedor||usuario.nome,
      entradas: entradaValor && parseFloat(entradaValor) > 0
        ? [...(ed.entradas||[]), {id:uid(), valor:parseFloat(entradaValor), data:hoje(), tipo:"Entrada"}]
        : (ed.entradas||[]),
      statusEnvio: ed.statusEnvio||"aguardando",
      rastreio: ed.rastreio||"", frete: ed.frete||0,
      criadoEm: ed.criadoEm||new Date().toISOString(),
    });
  };

  return (
    <div style={{background:S.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{background:S.card,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
        <button onClick={onCancelar} style={{background:"none",border:"none",color:S.sub,fontSize:22,cursor:"pointer",padding:4}}>←</button>
        <div style={{fontSize:17,fontWeight:700,color:S.txt}}>{ed.id?"Editar Pedido":"Novo Pedido"}</div>
      </div>

      {/* Conteúdo rolável */}
      <div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:100}}>
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Cliente</div>
          <Campo label="Nome do cliente" value={cliente} onChange={setCliente} placeholder="Nome completo"/>
          <Campo label="Telefone (últimos 4 dígitos)" value={tel} onChange={setTel} placeholder="ex: 9829"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Campo label="Data do pedido" value={dataPedido} onChange={onDataPedido} type="date"/>
            <Campo label="Prev. envio (15 dias úteis)" value={dataEnvio} onChange={setDataEnvio} type="date"/>
          </div>
        </Card>

        <Card>
          <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Kits</div>
          {kits.map((k,i)=>(
            <div key={i} style={{background:S.card2,borderRadius:12,padding:14,marginBottom:10,border:"1px solid "+S.borda}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:8,marginBottom:8}}>
                <Sel label="Kit" value={k.tam} onChange={v=>updKit(i,"tam",v)}
                  opts={[1,2,3,4,5,6].map(n=>({v:n,l:`Kit ${n} — ${fmt(PRECOS_KIT[n])}`}))}/>
                <Sel label="Voltagem" value={k.volt} onChange={v=>updKit(i,"volt",v)}
                  opts={[{v:"220v",l:"220v"},{v:"110v",l:"110v"}]}/>
                <Campo label="Qtd" value={k.qtd} onChange={v=>updKit(i,"qtd",v)} type="number"/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:S.sub}}>Subtotal: <b style={{color:S.verde}}>{fmt(PRECOS_KIT[k.tam]*k.qtd)}</b></span>
                {kits.length>1&&<button onClick={()=>remKit(i)} style={{background:"#EF444422",border:"none",color:"#EF4444",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:13}}>✕ Remover</button>}
              </div>
            </div>
          ))}
          <Btn onClick={addKit} v="secondary" sz="sm">+ Adicionar kit</Btn>
        </Card>

        <Card>
          <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Desconto</div>
          <Campo label="Desconto (%)" value={desc} onChange={setDesc} type="number" placeholder="0"/>
          <div style={{background:S.card2,borderRadius:12,padding:14,border:"1px solid "+S.borda}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:7,fontSize:14,color:S.sub}}>
              <span>Subtotal</span><span>{fmt(sub)}</span>
            </div>
            {Number(desc)>0&&(
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:7,fontSize:14,color:"#EF4444"}}>
                <span>Desconto ({desc}%)</span><span>-{fmt(dv)}</span>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:800,color:S.verde,borderTop:"1px solid "+S.borda,paddingTop:10,marginTop:4}}>
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Observações</div>
          <textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="PAC, arcos quadrados, instruções especiais..."
            style={{width:"100%",background:S.card2,border:"1px solid "+S.borda,borderRadius:10,padding:"11px 14px",color:S.txt,fontSize:14,minHeight:90,boxSizing:"border-box",outline:"none",resize:"vertical"}}/>
        </Card>

        <Card>
          <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>💰 Entrada (pagamento inicial)</div>
          <label style={{display:"block",background:"#00C89611",border:"2px dashed "+S.verde,borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",marginBottom:10}}>
            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
              const f=e.target.files[0];
              if(f){setComprovante(f);analisarComprovante(f);}
            }}/>
            {analisando?(
              <div style={{color:S.verde,fontSize:13}}>⏳ Lendo comprovante...</div>
            ):comprovante?(
              <div style={{color:S.verde,fontSize:13}}>✅ {comprovante.name}<br/><span style={{color:S.dim,fontSize:11}}>Toque para trocar</span></div>
            ):(
              <div style={{color:S.verde,fontSize:13}}>📷 Subir comprovante de entrada<br/><span style={{color:S.dim,fontSize:11}}>A IA lê o valor automaticamente</span></div>
            )}
          </label>
          <Campo label="Valor da entrada (R$)" value={entradaValor} onChange={setEntradaValor} type="number" placeholder="0,00"/>
          {entradaValor && parseFloat(entradaValor) > 0 && (
            <div style={{background:S.card2,borderRadius:10,padding:12,fontSize:13,color:S.dim}}>
              Saldo restante após entrada: <b style={{color:"#F59E0B"}}>{fmt((calcKit(kits,desc).total) - parseFloat(entradaValor))}</b>
            </div>
          )}
        </Card>
      </div>

      {/* Botões fixos no fundo */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:S.card,borderTop:"1px solid "+S.borda,padding:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,zIndex:100}}>
        <Btn onClick={onCancelar} v="secondary" full>Cancelar</Btn>
        <Btn onClick={salvar} v="primary" full>✓ Salvar Pedido</Btn>
      </div>
    </div>
  );
}

// ── DETALHE PEDIDO ────────────────────────────────────────────────────────────
function DetalhePedido({pedido, onVoltar, onAtualizar}) {
  const [novaEnt, setNovaEnt] = useState("");
  const [comprovante, setComprovante] = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const [frete, setFrete] = useState(pedido.frete||"");
  const [rastreio, setRastreio] = useState(pedido.rastreio||"");
  const [statusEnv, setStatusEnv] = useState(pedido.statusEnvio||"aguardando");
  const [editEnvio, setEditEnvio] = useState(false);
  const [compFrete, setCompFrete] = useState(null);
  const [analisandoFrete, setAnalisandoFrete] = useState(false);
  const [textoRastreio, setTextoRastreio] = useState("");
  const [copiado, setCopiado] = useState(false);

  const totalPago = (pedido.entradas||[]).reduce((s,e)=>s+(e.valor||0),0);
  const saldo = pedido.totalFinal - totalPago;
  const sf = sfin(pedido);

  // Converte imagem para base64
  const toBase64 = (file) => new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  // Analisa comprovante de pagamento via IA
  const analisarComprovante = async (file) => {
    if(!file) return;
    setAnalisando(true);
    try {
      const b64 = await toBase64(file);
      const resp = await fetch("/api/analisar",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({image:b64, mediaType:file.type, tipo:"pagamento"})
      });
      const parsed = await resp.json();
      if(parsed.valor) setNovaEnt(String(parsed.valor));
    } catch(e) {
      alert("Não consegui ler o valor. Digite manualmente.");
    }
    setAnalisando(false);
  };

  const addPgto = () => {
    const v = parseFloat(novaEnt);
    if(!v||v<=0) return alert("Informe um valor válido!");
    const entradas = [...(pedido.entradas||[]), {id:uid(),valor:v,data:hoje(),tipo:totalPago===0?"Entrada":"Parcela"}];
    onAtualizar({...pedido, entradas});
    setNovaEnt("");
    setComprovante(null);
  };

  // Analisa comprovante de frete via IA
  const analisarCompFrete = async (file) => {
    if(!file) return;
    setAnalisandoFrete(true);
    try {
      const b64 = await toBase64(file);
      const resp = await fetch("/api/analisar",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({image:b64, mediaType:file.type, tipo:"frete"})
      });
      const parsed = await resp.json();
      if(parsed.rastreio) setRastreio(parsed.rastreio);
      if(parsed.valor) {
        const comMargem = (parsed.valor * 1.25).toFixed(2);
        setFrete(comMargem);
        // Gera texto de rastreio automaticamente
        const txt2 = `CÓDIGO DE RASTREIO\n\n${parsed.rastreio||""}\n\nVALOR ENVIO ${fmt(parseFloat(comMargem))}`;
        setTextoRastreio(txt2);
      }
    } catch(e) {
      alert("Não consegui ler o comprovante. Preencha manualmente.");
    }
    setAnalisandoFrete(false);
  };

  const salvarEnvio = () => {
    onAtualizar({...pedido, statusEnvio:statusEnv, rastreio, frete:parseFloat(frete)||0});
    setEditEnvio(false);
  };

  const copiarTexto = () => {
    navigator.clipboard.writeText(textoRastreio).then(()=>{
      setCopiado(true);
      setTimeout(()=>setCopiado(false),2000);
    });
  };

  // Gera texto de rastreio manualmente se já tiver os dados
  const gerarTexto = () => {
    if(!rastreio) return alert("Informe o código de rastreio!");
    const txt = `CÓDIGO DE RASTREIO\n\n${rastreio}\n\nVALOR ENVIO ${fmt(parseFloat(frete)||0)}`;
    setTextoRastreio(txt);
  };

  return (
    <div style={{background:S.bg,minHeight:"100vh",paddingBottom:40}}>
      <div style={{background:S.card,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
        <button onClick={onVoltar} style={{background:"none",border:"none",color:S.sub,fontSize:22,cursor:"pointer",padding:4}}>←</button>
        <div>
          <div style={{fontSize:17,fontWeight:700,color:S.txt}}>{pedido.cliente}</div>
          <div style={{fontSize:12,color:S.dim}}>Tel: {pedido.telefone} · {fmtD(pedido.dataPedido)} · {pedido.vendedor}</div>
        </div>
      </div>

      <div style={{padding:16}}>
        {/* Kits */}
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Kits</div>
          {pedido.kits.map((k,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<pedido.kits.length-1?"1px solid "+S.borda:"none"}}>
              <span style={{color:S.txt,fontWeight:600}}>Kit {k.tam} baldinhos <span style={{color:S.dim,fontWeight:400}}>· {k.volt} · x{k.qtd}</span></span>
              <span style={{color:S.verde,fontWeight:700}}>{fmt(PRECOS_KIT[k.tam]*k.qtd)}</span>
            </div>
          ))}
          {pedido.obs&&<div style={{marginTop:14,background:"#F59E0B22",border:"2px solid #F59E0B",borderRadius:12,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}><span style={{fontSize:20}}>⚠️</span><div><div style={{fontSize:11,fontWeight:700,color:"#F59E0B",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Observações importantes</div><div style={{fontSize:14,color:S.txt,fontWeight:600,lineHeight:1.5}}>{pedido.obs}</div></div></div>}
        </Card>

        {/* Financeiro */}
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Financeiro</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:S.sub}}><span>Subtotal</span><span>{fmt(pedido.subtotal)}</span></div>
          {pedido.desconto>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:"#EF4444"}}><span>Desconto ({pedido.desconto}%)</span><span>-{fmt(pedido.descVal)}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:700,color:S.txt,borderTop:"1px solid "+S.borda,paddingTop:8,marginTop:4,marginBottom:16}}>
            <span>Total do kit</span><span>{fmt(pedido.totalFinal)}</span>
          </div>

          <div style={{fontSize:13,color:S.sub,marginBottom:8,fontWeight:600}}>Pagamentos recebidos:</div>
          {(pedido.entradas||[]).length===0&&<div style={{fontSize:13,color:S.dim,fontStyle:"italic",marginBottom:12}}>Nenhum pagamento ainda</div>}
          {(pedido.entradas||[]).map((e,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:14,padding:"7px 0",borderBottom:"1px solid "+S.borda}}>
              <span style={{color:S.sub}}>{e.tipo} · {fmtD(e.data)}</span>
              <span style={{color:"#10B981",fontWeight:700}}>{fmt(e.valor)}</span>
            </div>
          ))}

          <div style={{background:S.card2,borderRadius:12,padding:14,border:"1px solid "+S.borda,marginTop:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14}}>
              <span style={{color:S.sub}}>Total pago</span>
              <span style={{color:"#10B981",fontWeight:700}}>{fmt(totalPago)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:800}}>
              <span style={{color:S.sub}}>Saldo restante</span>
              <span style={{color:saldo>0?"#F59E0B":"#10B981"}}>{fmt(saldo)}</span>
            </div>
          </div>

          {/* Registrar pagamento com comprovante */}
          <div style={{marginTop:16,background:S.card2,borderRadius:12,padding:14,border:"1px solid "+S.borda}}>
            <div style={{fontSize:13,color:S.sub,marginBottom:10,fontWeight:700}}>📎 Registrar pagamento</div>

            {/* Upload comprovante */}
            <label style={{display:"block",background:"#00C89611",border:"2px dashed "+S.verde,borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",marginBottom:10}}>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                const f=e.target.files[0];
                if(f){setComprovante(f);analisarComprovante(f);}
              }}/>
              {analisando?(
                <div style={{color:S.verde,fontSize:13}}>⏳ Lendo comprovante...</div>
              ):comprovante?(
                <div style={{color:S.verde,fontSize:13}}>✅ {comprovante.name}<br/><span style={{color:S.dim,fontSize:11}}>Toque para trocar</span></div>
              ):(
                <div style={{color:S.verde,fontSize:13}}>📷 Subir comprovante de pagamento<br/><span style={{color:S.dim,fontSize:11}}>A IA lê o valor automaticamente</span></div>
              )}
            </label>

            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <input value={novaEnt} onChange={e=>setNovaEnt(e.target.value)} type="number" placeholder="Valor recebido (R$)"
                style={{flex:1,background:S.bg,border:"1px solid "+S.borda,borderRadius:10,padding:"11px 14px",color:S.txt,fontSize:14,outline:"none"}}/>
            </div>
            <Btn onClick={addPgto} v="primary" full>✓ Confirmar pagamento</Btn>
          </div>

          <div style={{marginTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:14,color:S.sub}}>Status financeiro:</span>
            <Badge label={STATUS_FIN[sf].label} cor={STATUS_FIN[sf].cor}/>
          </div>
        </Card>

        {/* Envio */}
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:S.verde,textTransform:"uppercase",letterSpacing:1}}>Envio</div>
            <Btn onClick={()=>setEditEnvio(!editEnvio)} v="ghost" sz="sm">{editEnvio?"Cancelar":"Editar"}</Btn>
          </div>
          {editEnvio?(
            <>
              <Sel label="Status" value={statusEnv} onChange={setStatusEnv}
                opts={Object.entries(STATUS_ENV).map(([v,l])=>({v,l:l.label}))}/>

              {/* Upload comprovante frete */}
              <div style={{marginBottom:13}}>
                <div style={{fontSize:12,color:S.sub,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Comprovante de frete</div>
                <label style={{display:"block",background:"#00C89611",border:"2px dashed "+S.verde,borderRadius:10,padding:14,textAlign:"center",cursor:"pointer"}}>
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                    const f=e.target.files[0];
                    if(f){setCompFrete(f);analisarCompFrete(f);}
                  }}/>
                  {analisandoFrete?(
                    <div style={{color:S.verde,fontSize:13}}>⏳ Lendo código e valor...</div>
                  ):compFrete?(
                    <div style={{color:S.verde,fontSize:13}}>✅ {compFrete.name}<br/><span style={{color:S.dim,fontSize:11}}>Rastreio e valor preenchidos automaticamente</span></div>
                  ):(
                    <div style={{color:S.verde,fontSize:13}}>📷 Subir comprovante dos Correios<br/><span style={{color:S.dim,fontSize:11}}>A IA lê código e valor (+25% automático)</span></div>
                  )}
                </label>
              </div>

              <Campo label="Código de rastreio" value={rastreio} onChange={setRastreio} placeholder="AA123456789BR"/>
              <Campo label="Valor frete cobrado (R$) — já com +25%" value={frete} onChange={v=>{setFrete(v);}} type="number" placeholder="0,00"/>
              <Btn onClick={salvarEnvio} v="primary" full>Salvar envio</Btn>
            </>
          ):(
            <>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:14}}><span style={{color:S.sub}}>Status</span><Badge label={STATUS_ENV[pedido.statusEnvio||"aguardando"].label} cor={STATUS_ENV[pedido.statusEnvio||"aguardando"].cor}/></div>
              {pedido.rastreio&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:14}}><span style={{color:S.sub}}>Rastreio</span><span style={{color:S.txt,fontWeight:600}}>{pedido.rastreio}</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:14}}><span style={{color:S.sub}}>Frete cobrado</span><span style={{color:S.txt}}>{fmt(pedido.frete||0)}</span></div>
              {pedido.dataEnvio&&<div style={{display:"flex",justifyContent:"space-between",fontSize:14}}><span style={{color:S.sub}}>Prev. envio</span><span style={{color:S.txt}}>{fmtD(pedido.dataEnvio)}</span></div>}
            </>
          )}
        </Card>

        {/* Texto de rastreio para cliente */}
        {(textoRastreio||(pedido.rastreio&&pedido.frete>0))&&(
          <Card>
            <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>📤 Mensagem para o cliente</div>
            <div style={{background:S.card2,borderRadius:12,padding:16,border:"1px solid "+S.borda,marginBottom:12}}>
              <pre style={{color:S.txt,fontSize:14,fontFamily:"monospace",margin:0,whiteSpace:"pre-wrap",lineHeight:1.8}}>
                {textoRastreio||`CÓDIGO DE RASTREIO\n\n${pedido.rastreio}\n\nVALOR ENVIO ${fmt(pedido.frete||0)}`}
              </pre>
            </div>
            <Btn onClick={copiarTexto} v={copiado?"secondary":"primary"} full>
              {copiado?"✅ Copiado!":"📋 Copiar mensagem"}
            </Btn>
            {!textoRastreio&&pedido.rastreio&&(
              <div style={{marginTop:8}}>
                <Btn onClick={gerarTexto} v="ghost" full>🔄 Gerar mensagem</Btn>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── HELPERS PRAZO ────────────────────────────────────────────────────────────
const diasRestantes = (dataEnvio) => {
  if(!dataEnvio) return null;
  const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
  const env = new Date(dataEnvio+"T00:00:00"); env.setHours(0,0,0,0);
  return Math.ceil((env-hoje2)/(1000*60*60*24));
};

const corPrazo = (dias) => {
  if(dias === null) return S.dim;
  if(dias <= 1) return "#EF4444";
  if(dias <= 5) return "#F59E0B";
  return "#10B981";
};

const labelPrazo = (dias) => {
  if(dias === null) return "";
  if(dias < 0) return `${Math.abs(dias)}d atrasado`;
  if(dias === 0) return "Enviar hoje!";
  if(dias === 1) return "Enviar amanhã!";
  return `${dias}d para envio`;
};

// ── LISTA PEDIDOS ─────────────────────────────────────────────────────────────
function ListaPedidos({pedidos, usuario, onSelecionar}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("producao");

  const base = (usuario.role==="admin" ? pedidos : pedidos.filter(p=>p.vendedor===usuario.nome))
    .filter(p=> p.cliente.toLowerCase().includes(busca.toLowerCase())||p.telefone.includes(busca));

  const lista = base.filter(p=>{
    if(filtro==="producao") return (p.statusEnvio||"aguardando")==="aguardando";
    if(filtro==="enviados") return p.statusEnvio==="enviado"||p.statusEnvio==="entregue";
    if(filtro==="pendentes") return sfin(p)==="pendente"||sfin(p)==="parcial";
    return true;
  }).sort((a,b)=>{
    if(filtro==="producao") {
      const da = diasRestantes(a.dataEnvio)||999;
      const db = diasRestantes(b.dataEnvio)||999;
      return da-db;
    }
    return new Date(b.criadoEm)-new Date(a.criadoEm);
  });

  const totalProducao = base.filter(p=>(p.statusEnvio||"aguardando")==="aguardando").length;
  const totalPendentes = base.filter(p=>sfin(p)==="pendente"||sfin(p)==="parcial").length;

  const filtros = [
    {v:"producao",l:"🔧 Em Produção", badge: totalProducao},
    {v:"enviados",l:"🚚 Enviados"},
    {v:"pendentes",l:"⚠️ Pendentes", badge: totalPendentes},
    {v:"todos",l:"📋 Todos"},
  ];

  return (
    <div>
      <div style={{padding:"0 16px 12px"}}>
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="🔍 Buscar cliente ou telefone..."
          style={{width:"100%",background:S.card,border:"none",borderRadius:12,padding:"12px 16px",color:S.txt,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
      </div>

      <div style={{display:"flex",gap:8,padding:"0 16px 14px",overflowX:"auto",scrollbarWidth:"none"}}>
        {filtros.map(f=>(
          <button key={f.v} onClick={()=>setFiltro(f.v)} style={{
            background:filtro===f.v?S.verde:S.card, color:filtro===f.v?"#0D1117":S.sub,
            border:"none",borderRadius:20,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
            display:"flex",alignItems:"center",gap:5,
          }}>
            {f.l}
            {f.badge>0 && <span style={{background:filtro===f.v?"#0D111788":"#EF444422",color:filtro===f.v?"#0D1117":"#EF4444",borderRadius:10,padding:"1px 6px",fontSize:11}}>{f.badge}</span>}
          </button>
        ))}
      </div>

      {lista.length===0&&(
        <div style={{textAlign:"center",padding:50,color:S.dim}}>
          <div style={{fontSize:44,marginBottom:12}}>📦</div>
          <div style={{fontWeight:600}}>Nenhum pedido encontrado</div>
          <div style={{fontSize:13,marginTop:6}}>Clique em "+ Novo" para adicionar</div>
        </div>
      )}

      <div style={{padding:"0 16px"}}>
        {lista.map(p=>{
          const sf2 = sfin(p);
          const totalPago = (p.entradas||[]).reduce((s,e)=>s+(e.valor||0),0);
          const dias = diasRestantes(p.dataEnvio);
          const cor = filtro==="producao" ? corPrazo(dias) : STATUS_FIN[sf2].cor;
          const pgtoFaltando = (sfin(p)==="pendente"||sfin(p)==="parcial") && (p.statusEnvio==="enviado"||p.statusEnvio==="entregue");
          return (
            <div key={p.id} onClick={()=>onSelecionar(p)}
              style={{background:S.card,borderRadius:16,padding:16,marginBottom:12,cursor:"pointer",borderLeft:`4px solid ${cor}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{fontSize:16,fontWeight:700,color:S.txt}}>{p.cliente}</div>
                {filtro==="producao" && dias!==null ? (
                  <span style={{background:corPrazo(dias)+"22",color:corPrazo(dias),padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>
                    {labelPrazo(dias)}
                  </span>
                ) : (
                  <Badge label={STATUS_FIN[sf2].label} cor={STATUS_FIN[sf2].cor}/>
                )}
              </div>
              <div style={{fontSize:13,color:S.sub,marginBottom:8}}>
                {p.kits.map(k=>`Kit ${k.tam} (${k.volt})`).join(", ")}
              </div>
              {pgtoFaltando && (
                <div style={{background:"#EF444422",borderRadius:8,padding:"6px 10px",marginBottom:8,fontSize:12,color:"#EF4444",fontWeight:600}}>
                  ⚠️ Pagamento pendente — {fmt(p.totalFinal - totalPago)} a receber
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13}}>
                  <span style={{color:S.dim}}>Pago: </span>
                  <span style={{color:"#10B981",fontWeight:700}}>{fmt(totalPago)}</span>
                  <span style={{color:S.dim}}> / {fmt(p.totalFinal)}</span>
                </div>
                {filtro!=="producao" && <Badge label={STATUS_ENV[p.statusEnvio||"aguardando"].label} cor={STATUS_ENV[p.statusEnvio||"aguardando"].cor}/>}
                {filtro==="producao" && p.dataEnvio && <span style={{fontSize:12,color:S.dim}}>Prev: {fmtD(p.dataEnvio)}</span>}
              </div>
              <div style={{fontSize:12,color:S.dim,marginTop:8}}>
                {fmtD(p.dataPedido)} · Tel: {p.telefone} · {p.vendedor}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{height:100}}/>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({pedidos, usuario}) {
  const [periodo, setPeriodo] = useState("mes");
  const agora = new Date();

  const filtrar = (p) => {
    const d = new Date(p.criadoEm);
    if(periodo==="mes") return d.getMonth()===agora.getMonth()&&d.getFullYear()===agora.getFullYear();
    if(periodo==="ano") return d.getFullYear()===agora.getFullYear();
    return true;
  };

  const lista = (usuario.role==="admin"?pedidos:pedidos.filter(p=>p.vendedor===usuario.nome)).filter(filtrar);
  const fat = lista.reduce((s,p)=>s+p.totalFinal,0);
  const recebido = lista.reduce((s,p)=>s+(p.entradas||[]).reduce((ss,e)=>ss+e.valor,0),0);
  const aReceber = fat-recebido;
  const totalKits = lista.reduce((s,p)=>s+p.kits.reduce((ss,k)=>ss+k.qtd,0),0);
  const descTotal = lista.reduce((s,p)=>s+(p.descVal||0),0);
  const agEnvio = lista.filter(p=>(p.statusEnvio||"aguardando")==="aguardando").length;
  const agPgto = lista.filter(p=>sfin(p)==="parcial").length;

  const porKit = [1,2,3,4,5,6].map(n=>({
    n, qtd: lista.reduce((s,p)=>s+p.kits.filter(k=>k.tam===n).reduce((ss,k)=>ss+k.qtd,0),0),
    fat: lista.reduce((s,p)=>s+p.kits.filter(k=>k.tam===n).reduce((ss,k)=>ss+PRECOS_KIT[n]*k.qtd,0),0),
  })).filter(k=>k.qtd>0);

  const porVendedor = usuario.role==="admin"
    ? Object.values(USUARIOS).map(u=>({
        nome:u.nome,
        kits:lista.filter(p=>p.vendedor===u.nome).reduce((s,p)=>s+p.kits.reduce((ss,k)=>ss+k.qtd,0),0),
        fat:lista.filter(p=>p.vendedor===u.nome).reduce((s,p)=>s+p.totalFinal,0),
      })).filter(v=>v.kits>0)
    : [];

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        {[{v:"mes",l:"Este mês"},{v:"ano",l:"Este ano"},{v:"tudo",l:"Tudo"}].map(f=>(
          <button key={f.v} onClick={()=>setPeriodo(f.v)} style={{
            background:periodo===f.v?S.verde:S.card,color:periodo===f.v?"#0D1117":S.sub,
            border:"none",borderRadius:20,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",
          }}>{f.l}</button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        {[
          {l:"Faturamento",v:fmt(fat),c:S.verde},
          {l:"Recebido",v:fmt(recebido),c:"#10B981"},
          {l:"A receber",v:fmt(aReceber),c:"#F59E0B"},
          {l:"Kits vendidos",v:totalKits,c:"#3B82F6"},
        ].map((c,i)=>(
          <div key={i} style={{background:S.card,borderRadius:16,padding:16}}>
            <div style={{fontSize:12,color:S.dim,marginBottom:6}}>{c.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c.c}}>{c.v}</div>
          </div>
        ))}
      </div>

      {usuario.role==="admin"&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div style={{background:S.card,borderRadius:16,padding:16}}>
              <div style={{fontSize:12,color:S.dim,marginBottom:6}}>Ag. envio</div>
              <div style={{fontSize:26,fontWeight:800,color:"#EF4444"}}>{agEnvio}</div>
            </div>
            <div style={{background:S.card,borderRadius:16,padding:16}}>
              <div style={{fontSize:12,color:S.dim,marginBottom:6}}>Ag. 2ª parcela</div>
              <div style={{fontSize:26,fontWeight:800,color:"#F59E0B"}}>{agPgto}</div>
            </div>
          </div>

          <Card>
            <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>Descontos dados</div>
            <div style={{fontSize:22,fontWeight:800,color:"#EF4444"}}>{fmt(descTotal)}</div>
            <div style={{fontSize:13,color:S.dim,marginTop:4}}>{fat>0?((descTotal/(fat+descTotal))*100).toFixed(1):0}% do faturamento bruto</div>
          </Card>

          <Card>
            <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Por vendedor</div>
            {porVendedor.length===0&&<div style={{fontSize:13,color:S.dim}}>Sem dados</div>}
            {porVendedor.map((v,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<porVendedor.length-1?"1px solid "+S.borda:"none"}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:S.txt}}>{v.nome}</div>
                  <div style={{fontSize:12,color:S.dim}}>{v.kits} kits</div>
                </div>
                <div style={{fontSize:15,fontWeight:700,color:S.verde}}>{fmt(v.fat)}</div>
              </div>
            ))}
          </Card>
        </>
      )}

      <Card>
        <div style={{fontSize:12,fontWeight:700,color:S.verde,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Por tipo de kit</div>
        {porKit.length===0&&<div style={{fontSize:13,color:S.dim}}>Sem dados no período</div>}
        {porKit.map((k,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<porKit.length-1?"1px solid "+S.borda:"none"}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:S.txt}}>Kit {k.n} baldinhos</div>
              <div style={{fontSize:12,color:S.dim}}>{k.qtd} unidades</div>
            </div>
            <div style={{fontSize:15,fontWeight:700,color:S.verde}}>{fmt(k.fat)}</div>
          </div>
        ))}
      </Card>
      <div style={{height:100}}/>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [tela, setTela] = useState("pedidos");
  const [subTela, setSubTela] = useState(null);
  const [pedSel, setPedSel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{ carregarDados().then(p=>{setPedidos(p);setLoading(false);}); },[]);

  const salvar = async (lista) => { setPedidos(lista); await salvarDados(lista); };

  const onSalvarPedido = (p) => {
    const lista = pedidos.find(x=>x.id===p.id) ? pedidos.map(x=>x.id===p.id?p:x) : [p,...pedidos];
    salvar(lista);
    setSubTela(null);
    setPedSel(null);
  };

  const onAtualizar = (p) => {
    salvar(pedidos.map(x=>x.id===p.id?p:x));
    setPedSel(p);
  };

  if(!usuario) return <Login onLogin={setUsuario}/>;

  if(subTela==="novo") return <FormPedido usuario={usuario} onSalvar={onSalvarPedido} onCancelar={()=>setSubTela(null)}/>;
  if(subTela==="editar"&&pedSel) return <FormPedido usuario={usuario} pedidoInicial={pedSel} onSalvar={onSalvarPedido} onCancelar={()=>setSubTela(null)}/>;
  if(subTela==="detalhe"&&pedSel) return <DetalhePedido pedido={pedSel} onVoltar={()=>{setSubTela(null);setPedSel(null);}} onAtualizar={onAtualizar}/>;

  return (
    <div style={{background:S.bg,minHeight:"100vh",maxWidth:600,margin:"0 auto",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      {/* Header */}
      <div style={{background:S.card,padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:50,borderBottom:"1px solid "+S.borda}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:26}}>🪣</span>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:S.verde,letterSpacing:-0.5}}>MACHADO SISTEMAS</div>
            <div style={{fontSize:11,color:S.dim}}>Olá, {usuario.nome}! 👋</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setSubTela("novo")} style={{background:S.verde,color:"#0D1117",border:"none",borderRadius:10,padding:"8px 16px",fontWeight:700,fontSize:14,cursor:"pointer"}}>+ Novo</button>
          <button onClick={()=>setUsuario(null)} style={{background:"none",border:"none",color:S.dim,fontSize:20,cursor:"pointer",padding:4}}>⎋</button>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{paddingBottom:80}}>
        {loading ? (
          <div style={{textAlign:"center",padding:60,color:S.dim}}>
            <div style={{fontSize:40,marginBottom:12}}>⏳</div>
            <div>Carregando...</div>
          </div>
        ) : (
          <>
            {tela==="pedidos"&&<ListaPedidos pedidos={pedidos} usuario={usuario} onSelecionar={p=>{setPedSel(p);setSubTela("detalhe");}}/>}
            {tela==="dashboard"&&<Dashboard pedidos={pedidos} usuario={usuario}/>}
          </>
        )}
      </div>

      {/* Nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,background:S.card,borderTop:"1px solid "+S.borda,display:"flex",zIndex:50}}>
        {[
          {id:"pedidos",icon:"📦",l:"Pedidos"},
          ...(usuario.role==="admin"?[{id:"dashboard",icon:"📊",l:"Relatórios"}]:[]),
        ].map(n=>(
          <button key={n.id} onClick={()=>setTela(n.id)} style={{
            flex:1,background:"none",border:"none",padding:"13px 0",cursor:"pointer",
            color:tela===n.id?S.verde:S.dim,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
          }}>
            <span style={{fontSize:22}}>{n.icon}</span>
            <span style={{fontSize:11,fontWeight:700}}>{n.l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
