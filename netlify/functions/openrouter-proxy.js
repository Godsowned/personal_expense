const OPENROUTER_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

export const config = {
  timeout: 60,
};

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
        'HTTP-Referer': req.headers.get('origin') || 'https://philexpense.netlify.app',
        'X-Title': 'Personal Expense and Development Tracker',
      },
      body: JSON.stringify({
        model: body.model || OPENROUTER_MODEL,
        messages,
        max_tokens: Math.min(Number(body.max_tokens || body.max_completion_tokens || 600), 900),
        temperature: body.temperature ?? 0.2,
        stream: false,
        provider: {
          allow_fallbacks: true,
          sort: 'throughput',
        },
      }),
    });

    const data = await res.json().catch(() => ({ error: 'OpenRouter returned a non-JSON response' }));

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
