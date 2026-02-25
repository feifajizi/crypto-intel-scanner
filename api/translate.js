// Serverless function for translating text using OpenAI API
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { text } = req.method === 'GET' ? req.query : req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    // Try OpenAI API first
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      // Fallback: return original text if no API key
      console.warn('No OPENAI_API_KEY found, translation disabled');
      return res.status(200).json({
        translation: text,
        source: 'fallback',
        message: 'Translation API not configured'
      });
    }

    // Call OpenAI API for translation
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the given English text to simplified Chinese. Only return the translation, no explanations.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const translation = data.choices[0]?.message?.content?.trim();

    if (!translation) {
      throw new Error('No translation returned');
    }

    return res.status(200).json({
      translation,
      source: 'openai',
      original: text
    });

  } catch (error) {
    console.error('Translation error:', error);
    
    // Fallback: return original text on error
    const { text } = req.method === 'GET' ? req.query : req.body;
    return res.status(200).json({
      translation: text || '',
      source: 'error-fallback',
      error: error.message
    });
  }
}
