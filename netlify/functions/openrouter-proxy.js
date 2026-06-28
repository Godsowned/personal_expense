const OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENROUTER_API_KEY not configured in Netlify' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const messages = [
      ...(body.system ? [{ role: 'system', content: body.system }] : []),
      ...(body.messages || []),
    ];

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.get('origin') || 'http://localhost:8888',
        'X-Title': 'Personal Expense and Development Tracker',
      },
      body: JSON.stringify({
        model: body.model || OPENROUTER_MODEL,
        messages,
        max_tokens: body.max_tokens || body.max_completion_tokens || 1000,
        temperature: body.temperature ?? 0.3,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
