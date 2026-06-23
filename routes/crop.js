const express = require('express');
const router = express.Router();

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';

// ── POST /api/crop/recommend ─────────────────────────────────────────────────
router.post('/recommend', async (req, res) => {
  const { location, soil_ph, tds, salinity, language } = req.body;

  if (!location || !soil_ph || !tds || !salinity) {
    return res.status(400).json({
      success: false,
      error: 'Please provide location, soil_ph, tds and salinity'
    });
  }

  const prompt = `You are an expert agricultural advisor for Pakistan.
A farmer in ${location} has these soil conditions:
- Soil pH: ${soil_ph}
- Water TDS: ${tds} ppm
- Soil Salinity: ${salinity} dS/m

Recommend the top 5 best crops to grow.
Return ONLY a valid JSON array like this:
[
  {
    "name": "Wheat",
    "confidence_percent": 94,
    "season": "Rabi (Nov-Apr)",
    "water_needs_mm": 400,
    "yield_per_acre": "45 bags",
    "market_price_pkr": 3500,
    "quick_tip": "Sow in mid-November for best yield"
  }
]
Return only the JSON array. No explanation. No markdown. No extra text.
Language for quick_tip field: ${language || 'English'}`;

  try {
    console.log('Crop recommend - key:', CLAUDE_API_KEY ? CLAUDE_API_KEY.substring(0, 20) + '...' : 'NO KEY');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    console.log('Crop recommend response:', JSON.stringify(data).substring(0, 300));

    if (data.error) {
      return res.status(500).json({
        success: false,
        error: `API Error: ${data.error.type} - ${data.error.message}`
      });
    }

    if (!data.content || data.content.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'No response from AI. Check your API key.',
        debug: data
      });
    }

    let text = data.content[0].text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const startIndex = text.indexOf('[');
    const endIndex   = text.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1) {
      text = text.substring(startIndex, endIndex + 1);
    }

    const crops = JSON.parse(text);
    res.json({ success: true, crops });

  } catch (err) {
    console.error('Crop recommend error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;