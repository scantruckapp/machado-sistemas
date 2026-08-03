export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { image, mediaType, tipo } = req.body;

  const prompt = tipo === 'frete'
    ? 'Analise este comprovante dos Correios. Extraia o código de rastreio e o valor do frete. Responda SOMENTE com JSON: {"rastreio": "AA123456789BR", "valor": 45.50}'
    : 'Analise este comprovante de pagamento. Extraia APENAS o valor em reais transferido. Responda SOMENTE com JSON: {"valor": 1250.00}';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${image}` } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    const data = await response.json();
    const txt = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
