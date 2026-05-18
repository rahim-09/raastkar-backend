const express = require('express');
const router = express.Router();

const CREDIT_RATES = {
  wheat: 0.018, rice: 0.022, cotton: 0.015,
  sugarcane: 0.025, maize: 0.020, default: 0.018
};

const PRACTICE_BONUSES = {
  biogas: 30, organic_farming: 25, no_burning: 20,
  drip_irrigation: 15, compost: 12,
  solar_pump: 18, tree_plantation: 22, default: 5
};

router.post('/calculate', (req, res) => {
  const { acres, plants_per_acre, crop, practices } = req.body;

  if (!acres || !plants_per_acre || !crop) {
    return res.status(400).json({
      success: false,
      error: 'Please provide acres, plants_per_acre and crop'
    });
  }

  const rate = CREDIT_RATES[crop.toLowerCase()] || CREDIT_RATES.default;
  const totalPlants = acres * plants_per_acre;
  const baseCredits = Math.round(totalPlants * rate);

  let bonusCredits = 0;
  const bonusBreakdown = [];
  if (practices && practices.length > 0) {
    practices.forEach(p => {
      const bonus = PRACTICE_BONUSES[p] || PRACTICE_BONUSES.default;
      bonusCredits += bonus;
      bonusBreakdown.push({ practice: p, credits: bonus });
    });
  }

  const totalCredits = baseCredits + bonusCredits;
  const estimatedValuePKR = totalCredits * 850;
  const co2KgSequestered = Math.round(totalPlants * 2.2);

  res.json({
    success: true,
    breakdown: {
      total_plants: totalPlants,
      co2_kg_sequestered: co2KgSequestered,
      base_credits: baseCredits,
      bonus_credits: bonusCredits,
      bonus_detail: bonusBreakdown,
      total_credits: totalCredits,
      estimated_value_pkr: estimatedValuePKR,
      pkr_per_credit: 850
    }
  });
});

router.get('/practices', (req, res) => {
  res.json({
    success: true,
    practices: [
      { id: 'biogas', label: 'Biogas Plant', credits: 30 },
      { id: 'organic_farming', label: 'Organic Farming', credits: 25 },
      { id: 'tree_plantation', label: 'Tree Plantation', credits: 22 },
      { id: 'no_burning', label: 'No Crop Burning', credits: 20 },
      { id: 'solar_pump', label: 'Solar Water Pump', credits: 18 },
      { id: 'drip_irrigation', label: 'Drip Irrigation', credits: 15 },
      { id: 'compost', label: 'Composting', credits: 12 },
    ]
  });
});

module.exports = router;