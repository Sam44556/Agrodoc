import { Router } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/farmer/weather - Get current weather for farmer's location
 */
router.get("/", farmerOnlyRoute, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log("🌤️ Weather request from user:", userId);
        // Get farmer's location
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                location: true,
                name: true
            }
        });
        console.log("👤 User data:", user);
        if (!user || !user.location) {
            console.log("❌ No location found for user");
            return res.status(400).json({
                error: "Location not found",
                message: "Please update your location in profile settings to get weather data"
            });
        }
        // Get real weather data from OpenWeatherMap
        console.log("🔄 Fetching weather for location:", user.location);
        const weatherData = await getRealWeather(user.location);
        console.log("✅ Weather data received:", JSON.stringify(weatherData, null, 2));
        const responseData = {
            success: true,
            data: {
                location: user.location,
                farmerName: user.name,
                current: weatherData.current,
                today: weatherData.today,
                alerts: weatherData.alerts,
                farmingTips: weatherData.farmingTips
            }
        };
        console.log("📤 Sending weather response:", JSON.stringify(responseData, null, 2));
        res.json(responseData);
    }
    catch (error) {
        console.error("❌ Error fetching weather:", error);
        res.status(500).json({
            error: "Failed to fetch weather",
            message: "Could not retrieve weather information"
        });
    }
});
/**
 * GET /api/farmer/weather/forecast - Get 7-day weather forecast
 */
router.get("/forecast", farmerOnlyRoute, async (req, res) => {
    try {
        const userId = req.user.id;
        // Get farmer's location
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                location: true
            }
        });
        if (!user || !user.location) {
            return res.status(400).json({
                error: "Location not found",
                message: "Please update your location in profile settings"
            });
        }
        // Get real weather forecast from OpenWeatherMap
        const forecast = await getRealForecast(user.location);
        res.json({
            success: true,
            data: {
                location: user.location,
                forecast: forecast,
                weeklyTips: [
                    "Good week for planting teff - soil moisture is optimal",
                    "Consider harvesting mature crops before Thursday's rain",
                    "Perfect conditions for organic pest control early morning"
                ]
            }
        });
    }
    catch (error) {
        console.error("❌ Error fetching forecast:", error);
        res.status(500).json({
            error: "Failed to fetch forecast",
            message: "Could not retrieve weather forecast"
        });
    }
});
/**
 * GET /api/farmer/weather/alerts - Get weather alerts and farming recommendations
 */
router.get("/alerts", farmerOnlyRoute, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log("🚨 Alerts request from user:", userId);
        // Get farmer's location
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                location: true
            }
        });
        console.log("👤 User location:", user?.location);
        if (!user) {
            return res.status(404).json({
                error: "User not found"
            });
        }
        // Get farmer's crops from their produce listings
        const farmerCrops = await prisma.produce.findMany({
            where: { farmerId: userId },
            select: { name: true },
            distinct: ['name'],
            take: 10
        });
        const cropNames = farmerCrops.map(c => c.name);
        console.log("🌾 Farmer crops:", cropNames);
        // Generate crop-specific alerts
        const alerts = generateCropAlerts(user.location || "Ethiopia", cropNames);
        console.log("📤 Sending alerts:", alerts.length, "alerts");
        res.json({
            success: true,
            data: {
                alerts: alerts,
                recommendations: [
                    {
                        priority: "high",
                        title: "Irrigation Timing",
                        message: "Early morning irrigation recommended due to high daytime temperatures",
                        action: "Water crops between 5-7 AM"
                    },
                    {
                        priority: "medium",
                        title: "Pest Control",
                        message: "Optimal conditions for natural pest control",
                        action: "Apply neem oil treatment this evening"
                    }
                ]
            }
        });
    }
    catch (error) {
        console.error("❌ Error fetching alerts:", error);
        res.status(500).json({
            error: "Failed to fetch alerts",
            message: "Could not retrieve weather alerts"
        });
    }
});
// OpenWeatherMap API configuration
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "your_api_key_here";
const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";
// Helper function to get real weather data from OpenWeatherMap
async function getRealWeather(location) {
    try {
        // Current weather API call
        const weatherResponse = await fetch(`${OPENWEATHER_BASE_URL}/weather?q=${encodeURIComponent(location)},ET&appid=${OPENWEATHER_API_KEY}&units=metric`);
        if (!weatherResponse.ok) {
            throw new Error(`Weather API error: ${weatherResponse.status}`);
        }
        const weatherData = await weatherResponse.json();
        // UV Index API call (requires lat/lon)
        const lat = weatherData.coord.lat;
        const lon = weatherData.coord.lon;
        let uvIndex = 7; // Default moderate UV
        try {
            const uvResponse = await fetch(`${OPENWEATHER_BASE_URL}/uvi?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`);
            if (uvResponse.ok) {
                const uvData = await uvResponse.json();
                uvIndex = Math.round(uvData.value);
            }
        }
        catch (uvError) {
            console.log("UV index not available, using default");
        }
        const current = {
            temperature: Math.round(weatherData.main.temp),
            humidity: weatherData.main.humidity,
            windSpeed: Math.round(weatherData.wind?.speed * 3.6) || 0, // Convert m/s to km/h
            condition: mapWeatherCondition(weatherData.weather[0].main),
            pressure: weatherData.main.pressure,
            uvIndex: uvIndex,
            visibility: Math.round((weatherData.visibility || 10000) / 1000), // Convert m to km
            feelsLike: Math.round(weatherData.main.feels_like),
            description: weatherData.weather[0].description
        };
        const today = {
            high: Math.round(weatherData.main.temp_max),
            low: Math.round(weatherData.main.temp_min),
            sunrise: new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            }),
            sunset: new Date(weatherData.sys.sunset * 1000).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            }),
            moonPhase: ["new", "waxing", "full", "waning"][Math.floor(Math.random() * 4)], // API doesn't provide this
            chanceOfRain: weatherData.clouds?.all || 0 // Use cloud coverage as rain estimate
        };
        return {
            current,
            today,
            alerts: generateWeatherAlerts(location, current.temperature),
            farmingTips: generateFarmingTips(current.temperature, current.humidity > 70)
        };
    }
    catch (error) {
        console.error("❌ OpenWeatherMap API error:", error);
        // Fallback to mock data if API fails
        console.log("📝 Using fallback weather data");
        return generateMockWeather(location);
    }
}
// Helper function to get real forecast from OpenWeatherMap
async function getRealForecast(location) {
    try {
        const forecastResponse = await fetch(`${OPENWEATHER_BASE_URL}/forecast?q=${encodeURIComponent(location)},ET&appid=${OPENWEATHER_API_KEY}&units=metric`);
        if (!forecastResponse.ok) {
            throw new Error(`Forecast API error: ${forecastResponse.status}`);
        }
        const forecastData = await forecastResponse.json();
        // Group forecast by day (API returns 3-hour intervals)
        const dailyForecasts = groupForecastByDay(forecastData.list);
        return dailyForecasts.slice(0, 7); // Return 7 days
    }
    catch (error) {
        console.error("❌ OpenWeatherMap Forecast API error:", error);
        // Fallback to mock data
        return generateMockForecast(location);
    }
}
// Helper function to group 3-hour forecasts into daily forecasts
function groupForecastByDay(forecastList) {
    const dailyData = {};
    const days = ["Today", "Tomorrow", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    forecastList.forEach((forecast, index) => {
        const date = new Date(forecast.dt * 1000).toDateString();
        if (!dailyData[date]) {
            dailyData[date] = {
                day: days[Object.keys(dailyData).length] || new Date(forecast.dt * 1000).toLocaleDateString('en-US', { weekday: 'long' }),
                date: new Date(forecast.dt * 1000).toISOString().split('T')[0],
                temps: [],
                conditions: [],
                humidity: [],
                windSpeeds: [],
                rainChances: []
            };
        }
        dailyData[date].temps.push(forecast.main.temp);
        dailyData[date].conditions.push(forecast.weather[0].main);
        dailyData[date].humidity.push(forecast.main.humidity);
        dailyData[date].windSpeeds.push(forecast.wind?.speed * 3.6 || 0);
        dailyData[date].rainChances.push(forecast.pop * 100); // Probability of precipitation
    });
    // Calculate daily averages and pick most common condition
    return Object.values(dailyData).map((day) => ({
        day: day.day,
        date: day.date,
        high: Math.round(Math.max(...day.temps)),
        low: Math.round(Math.min(...day.temps)),
        condition: mapWeatherCondition(getMostFrequent(day.conditions)),
        chanceOfRain: Math.round(Math.max(...day.rainChances)),
        windSpeed: Math.round(day.windSpeeds.reduce((a, b) => a + b, 0) / day.windSpeeds.length),
        humidity: Math.round(day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length)
    }));
}
// Helper function to map OpenWeatherMap conditions to our format
function mapWeatherCondition(condition) {
    const conditionMap = {
        'Clear': 'sunny',
        'Clouds': 'cloudy',
        'Rain': 'rain',
        'Drizzle': 'rain',
        'Thunderstorm': 'thunderstorm',
        'Snow': 'snow',
        'Mist': 'cloudy',
        'Fog': 'cloudy',
        'Haze': 'cloudy'
    };
    return conditionMap[condition] || 'partly_cloudy';
}
// Helper function to get most frequent item in array
function getMostFrequent(arr) {
    const frequency = {};
    let maxCount = 0;
    let mostFrequent = arr[0];
    arr.forEach(item => {
        frequency[item] = (frequency[item] || 0) + 1;
        if (frequency[item] > maxCount) {
            maxCount = frequency[item];
            mostFrequent = item;
        }
    });
    return mostFrequent;
}
// Helper function to generate mock weather data (fallback)
function generateMockWeather(location) {
    const temperatures = [22, 28, 31, 26, 24]; // Typical Ethiopian temps
    const currentTemp = temperatures[Math.floor(Math.random() * temperatures.length)];
    return {
        current: {
            temperature: currentTemp,
            humidity: Math.floor(Math.random() * 30) + 50, // 50-80%
            windSpeed: Math.floor(Math.random() * 15) + 5, // 5-20 km/h
            condition: Math.random() > 0.7 ? "cloudy" : "sunny",
            pressure: Math.floor(Math.random() * 20) + 1010, // 1010-1030 hPa
            uvIndex: Math.floor(Math.random() * 5) + 6, // 6-10 (high)
            visibility: Math.floor(Math.random() * 5) + 8, // 8-12 km
            feelsLike: currentTemp + Math.floor(Math.random() * 6) - 3
        },
        today: {
            high: currentTemp + Math.floor(Math.random() * 5) + 2,
            low: currentTemp - Math.floor(Math.random() * 5) - 2,
            sunrise: "06:15",
            sunset: "18:45",
            moonPhase: ["new", "waxing", "full", "waning"][Math.floor(Math.random() * 4)],
            chanceOfRain: Math.floor(Math.random() * 60) + 10 // 10-70%
        },
        alerts: generateWeatherAlerts(location, currentTemp),
        farmingTips: generateFarmingTips(currentTemp, Math.random() > 0.5)
    };
}
// Helper function to generate 7-day forecast
function generateMockForecast(location) {
    const days = ["Today", "Tomorrow", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const forecast = [];
    for (let i = 0; i < 7; i++) {
        const baseTemp = 25 + Math.floor(Math.random() * 8); // 25-33°C
        forecast.push({
            day: days[i],
            date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            high: baseTemp + Math.floor(Math.random() * 4),
            low: baseTemp - Math.floor(Math.random() * 8),
            condition: ["sunny", "partly_cloudy", "cloudy", "rain"][Math.floor(Math.random() * 4)],
            chanceOfRain: Math.floor(Math.random() * 80),
            windSpeed: Math.floor(Math.random() * 15) + 5,
            humidity: Math.floor(Math.random() * 30) + 50
        });
    }
    return forecast;
}
// Helper function for weather alerts
function generateWeatherAlerts(location, temperature) {
    const alerts = [];
    if (temperature > 30) {
        alerts.push({
            type: "heat",
            severity: "warning",
            title: "High Temperature Alert",
            message: "Extremely hot conditions expected. Protect crops from heat stress.",
            action: "Increase irrigation frequency and provide shade cover"
        });
    }
    if (Math.random() > 0.7) {
        alerts.push({
            type: "rain",
            severity: "info",
            title: "Rain Expected",
            message: "Moderate rainfall expected in the next 24 hours",
            action: "Delay pesticide application and prepare drainage"
        });
    }
    return alerts;
}
// Helper function for farming tips
function generateFarmingTips(temperature, isRainy) {
    const tips = [
        {
            category: "irrigation",
            tip: temperature > 28
                ? "Increase watering frequency during hot weather"
                : "Maintain regular watering schedule",
            timing: "Early morning (5-7 AM) is best for irrigation"
        },
        {
            category: "planting",
            tip: isRainy
                ? "Good conditions for planting seeds - soil moisture is adequate"
                : "Pre-water soil before planting in dry conditions",
            timing: "Plant early in the morning or late afternoon"
        },
        {
            category: "harvesting",
            tip: "Check crop maturity daily - harvest timing is critical for quality",
            timing: "Harvest in dry conditions, avoid rainy periods"
        }
    ];
    return tips;
}
// Helper function for crop-specific alerts
function generateCropAlerts(location, crops) {
    const alerts = [];
    crops.forEach(crop => {
        switch (crop.toLowerCase()) {
            case "teff":
                alerts.push({
                    crop: "Teff",
                    alert: "Optimal growing conditions - monitor for lodging risk",
                    severity: "info",
                    action: "Ensure proper spacing and support if needed"
                });
                break;
            case "coffee":
                alerts.push({
                    crop: "Coffee",
                    alert: "Cherry development phase - maintain consistent moisture",
                    severity: "warning",
                    action: "Regular irrigation essential, avoid water stress"
                });
                break;
            case "wheat":
                alerts.push({
                    crop: "Wheat",
                    alert: "Head formation stage - protect from extreme weather",
                    severity: "info",
                    action: "Monitor for rust diseases in humid conditions"
                });
                break;
            default:
                alerts.push({
                    crop: crop,
                    alert: "Monitor crop development closely",
                    severity: "info",
                    action: "Adjust irrigation and care based on growth stage"
                });
        }
    });
    return alerts;
}
export default router;
