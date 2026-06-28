const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

export const config = {
  timeout: 60,
};

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
    });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'ANTHROPIC_API_KEY not configured in Netlify',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const body = await req.json();

    const messages = (body.messages || []).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model || ANTHROPIC_MODEL,
        system: body.system || '',
        messages,
        max_tokens: Math.min(
          Number(body.max_tokens || body.max_completion_tokens || 600),
          900
        ),
        temperature: body.temperature ?? 0.2,
      }),
    });

    const data = await response.json().catch(() => ({
      error: 'Anthropic returned a non-JSON response',
    }));

    if (!response.ok) {
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};