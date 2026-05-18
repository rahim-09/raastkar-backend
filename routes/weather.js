const express = require('express');
const router = express.Router();

router.get('/current', async (req, res) => {
  const { city } = req.query;

  if (!city) {
    return res.status(400).json({
      success: false,
      error: 'Please provide city name'
    });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city},PK&appid=${process.env.WEATHER_API_KEY}&units=metric`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.cod !== 200) {
      return res.status(404).json({
        success: false,
        error: 'City not found'
      });
    }

    const weather = {
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      wind_speed: Math.round(data.wind.speed * 3.6),
      condition: data.weather[0].main,
      description: data.weather[0].description,
      city: data.name,
      visibility: Math.round((data.visibility || 10000) / 1000)
    };

    const alerts = [];
    if (weather.temp >= 40) {
      alerts.push({
        type: 'heat_wave',
        severity: 'HIGH',
        title: 'Heat Wave Warning',
        message: `Temperature is ${weather.temp}°C — extreme heat`,
        advice: 'Irrigate early morning and evening. Provide shade for livestock.'
      });
    }
    if (weather.temp >= 35 && weather.temp < 40) {
      alerts.push({
        type: 'heat_warning',
        severity: 'MEDIUM',
        title: 'High Temperature Alert',
        message: `Temperature is ${weather.temp}°C — above normal`,
        advice: 'Increase watering frequency for sensitive crops.'
      });
    }
    if (weather.humidity > 85) {
      alerts.push({
        type: 'flood_risk',
        severity: 'MEDIUM',
        title: 'High Humidity Alert',
        message: 'High humidity detected — risk of fungal diseases',
        advice: 'Check drainage. Watch for fungal infections on crops.'
      });
    }
    if (weather.wind_speed > 50) {
      alerts.push({
        type: 'strong_wind',
        severity: 'HIGH',
        title: 'Strong Wind Warning',
        message: `Wind speed ${weather.wind_speed} km/h`,
        advice: 'Support tall crops. Delay spraying pesticides.'
      });
    }

    res.json({ success: true, weather, alerts });
  } catch (err) {
    console.error('Weather error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/forecast', async (req, res) => {
  const { city } = req.query;

  if (!city) {
    return res.status(400).json({
      success: false,
      error: 'Please provide city name'
    });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${city},PK&appid=${process.env.WEATHER_API_KEY}&units=metric&cnt=40`;
    const response = await fetch(url);
    const data = await response.json();

    const dailyMap = {};
    data.list.forEach(item => {
      const date = item.dt_txt.split(' ')[0];
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          temp_max: item.main.temp_max,
          temp_min: item.main.temp_min,
          condition: item.weather[0].main,
          humidity: item.main.humidity
        };
      } else {
        if (item.main.temp_max > dailyMap[date].temp_max)
          dailyMap[date].temp_max = item.main.temp_max;
        if (item.main.temp_min < dailyMap[date].temp_min)
          dailyMap[date].temp_min = item.main.temp_min;
      }
    });

    const forecast = Object.values(dailyMap).slice(0, 5).map(d => ({
      date: d.date,
      temp_max: Math.round(d.temp_max),
      temp_min: Math.round(d.temp_min),
      condition: d.condition,
      humidity: d.humidity
    }));

    res.json({ success: true, forecast });
  } catch (err) {
    console.error('Forecast error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;