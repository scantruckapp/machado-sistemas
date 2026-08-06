export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { texto } = req.body;
  if (!texto || !texto.trim()) {
    return res.status(400).json({ erro: 'Texto vazio' });
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ erro: 'Chave API não configurada' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: 'Você extrai dados fiscais de textos e retorna APENAS JSON válido, sem markdown, sem explicação.',
          },
          {
            role: 'user',
            content: `Extraia os dados fiscais do texto abaixo e retorne APENAS um JSON válido:\n\n${texto}\n\nRetorne exatamente neste formato:\n{"razao":"","cnpj":"","email":"","cep":"","logradouro":"","numero":"","bairro":"","cidade":"","uf":"","ie":""}\n\nRegras: cnpj só números, cep só números, uf só 2 letras maiúsculas, ie só números (ou vazio se não tiver). Se não encontrar algum campo, deixe vazio.`,
          },
        ],
      }),
    });

    const data = await response.json();
    const txt = data.choices?.[0]?.message?.content?.trim() || '{}';
    const clean = txt.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
