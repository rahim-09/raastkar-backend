const express = require('express');
const router = express.Router();

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';

async function callClaude(messages, maxTokens = 1200) {
  console.log('Calling Claude with key:', CLAUDE_API_KEY ? CLAUDE_API_KEY.substring(0, 20) + '...' : 'NO KEY FOUND');
  console.log('Model:', MODEL);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages })
  });

  const data = await response.json();
  console.log('Claude raw response:', JSON.stringify(data).substring(0, 300));

  if (data.error) {
    throw new Error(`Anthropic API error: ${data.error.type} - ${data.error.message}`);
  }

  if (!data.content || data.content.length === 0) {
    throw new Error('Empty response from Claude API');
  }

  return data.content[0].text;
}

function parseJSON(text, isArray = false) {
  text = text.replace(/```json|```/g, '').trim();
  const start = text.indexOf(isArray ? '[' : '{');
  const end   = text.lastIndexOf(isArray ? ']' : '}');
  if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
  return JSON.parse(text);
}

// ── POST /api/drcrop/diagnose ────────────────────────────────────────────────
router.post('/diagnose', async (req, res) => {
  const { crop, symptoms, language } = req.body;

  if (!crop || !symptoms) {
    return res.status(400).json({ success: false, error: 'Please provide crop and symptoms' });
  }

  const prompt = `You are an expert agronomist specializing in Pakistani crops.
A ${crop} plant shows these symptoms: ${symptoms}

Provide a diagnosis in exactly this JSON format:
{
  "disease_name": "name of disease",
  "severity": "low or medium or high or critical",
  "confidence_percent": 88,
  "organic_treatment": ["step 1", "step 2", "step 3"],
  "chemical_treatment": {
    "product": "product name",
    "dose": "amount and how to apply",
    "frequency": "how often"
  },
  "prevention_steps": ["tip 1", "tip 2", "tip 3"],
  "fertilizer_schedule": "advice on fertilizer",
  "water_recommendation": "watering advice"
}

Reply ONLY with valid JSON. No extra text.
Language: ${language || 'English'}`;

  try {
    const text      = await callClaude([{ role: 'user', content: prompt }]);
    const diagnosis = parseJSON(text);
    res.json({ success: true, diagnosis });
  } catch (err) {
    console.error('Dr Crop diagnose error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/drcrop/diagnose-photo ─────────────────────────────────────────
router.post('/diagnose-photo', async (req, res) => {
  const { crop, image, language } = req.body;

  if (!crop || !image) {
    return res.status(400).json({ success: false, error: 'Please provide crop and image' });
  }

  const prompt = `You are an expert agronomist.
Carefully analyze this plant photo of a ${crop} crop.
Look for any signs of disease, pest damage, nutrient deficiency, or stress.

Return ONLY this exact JSON format:
{
  "disease_name": "name of disease or condition",
  "severity": "low or medium or high or critical",
  "confidence_percent": 85,
  "organic_treatment": ["step 1", "step 2", "step 3"],
  "chemical_treatment": {
    "product": "product name",
    "dose": "amount and how to apply",
    "frequency": "how often"
  },
  "prevention_steps": ["tip 1", "tip 2", "tip 3"],
  "fertilizer_schedule": "fertilizer advice",
  "water_recommendation": "watering advice"
}

If the plant looks healthy, set disease_name to "Healthy Plant" and severity to "low".
Reply ONLY with valid JSON. No extra text.
Language: ${language || 'English'}`;

  try {
    const messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: prompt }
      ]
    }];
    const text      = await callClaude(messages);
    const diagnosis = parseJSON(text);
    res.json({ success: true, diagnosis });
  } catch (err) {
    console.error('Photo diagnosis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;