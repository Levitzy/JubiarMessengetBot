const axios = require("axios");

const activeSessions = new Map(); 

module.exports = {
    name: "growagardenv2",
    description: "Track Grow A Garden stock + weather 5s before gear/seeds resets (every 5min)",
    usage: "growagardenv2 on | off | status",
    aliases: ["gagv2", "gagstock2"],
    admin_only: true,
    
    run: async ({ api, event, args, config, commands }) => {
        const { threadID, senderID } = event;
        const action = args[0]?.toLowerCase();

        const getMillisecondsUntilGearReset = () => {
            const now = Date.now();
            const nowDate = new Date(now);
            const currentMinutes = nowDate.getMinutes();
            const currentSeconds = nowDate.getSeconds();
            const currentMs = nowDate.getMilliseconds();
            
            const totalCurrentSeconds = (currentMinutes * 60) + currentSeconds;
            const resetIntervalSeconds = 5 * 60;
            
            const secondsSinceLastReset = totalCurrentSeconds % resetIntervalSeconds;
            const secondsUntilNextReset = resetIntervalSeconds - secondsSinceLastReset;
            
            const msUntilReset = (secondsUntilNextReset * 1000) - currentMs;
            const afterResetMs = msUntilReset + 1000;
            
            return afterResetMs;
        };

        if (action === "off") {
            const session = activeSessions.get(senderID);
            if (session) {
                clearTimeout(session.timeout);
                const runningTime = Math.floor((Date.now() - session.startTime) / 1000 / 60);
                const updateCount = session.updateCount || 0;
                activeSessions.delete(senderID);
                return api.sendMessage(`🛑 Grow A Garden V2 tracking stopped.\n\n📊 Final Stats:\n⏱️ Ran for: ${runningTime} minutes\n📈 Updates sent: ${updateCount}`, threadID);
            } else {
                return api.sendMessage("⚠️ You don't have an active V2 tracking session.", threadID);
            }
        }

        if (action === "status") {
            const session = activeSessions.get(senderID);
            if (session) {
                const runningTime = Math.floor((Date.now() - session.startTime) / 1000 / 60);
                const updateCount = session.updateCount || 0;
                const nextResetMs = getMillisecondsUntilGearReset();
                const nextResetMinutes = Math.floor(nextResetMs / 60000);
                const nextResetSeconds = Math.floor((nextResetMs % 60000) / 1000);
                return api.sendMessage(`📊 V2 Tracking Status: ACTIVE ✅\n\n⏱️ Running for: ${runningTime} minutes\n📈 Updates sent: ${updateCount}\n🔄 Next update: ${nextResetMinutes}m ${nextResetSeconds}s (5s before gear reset)\n\nUse 'growagardenv2 off' to stop`, threadID);
            } else {
                return api.sendMessage("❌ No active V2 tracking session.\n\nUse 'growagardenv2 on' to start tracking", threadID);
            }
        }

        if (action !== "on") {
            return api.sendMessage("📌 Usage:\n• `growagardenv2 on` - Start auto tracking\n• `growagardenv2 off` - Stop tracking\n• `growagardenv2 status` - Check status\n\n⚡ Updates 5s before gear/seeds resets (5min)!", threadID);
        }

        if (activeSessions.has(senderID)) {
            return api.sendMessage("📡 You're already tracking Grow A Garden V2. Use `growagardenv2 off` to stop.", threadID);
        }

        const nextResetMs = getMillisecondsUntilGearReset();
        const nextResetMinutes = Math.floor(nextResetMs / 60000);
        const nextResetSeconds = Math.floor((nextResetMs % 60000) / 1000);
        
        api.sendMessage(`✅ Grow A Garden V2 auto-tracking started!\n\n🔄 Updates 5s before gear/seeds resets (every 5min)\n🌐 Using official growagarden.gg API\n⏰ Reset times: Gear/Seeds (5min) | Eggs (30min) | Cosmetics (4h) | Honey (1h)\n🍯 Now includes: Honey, Night & Blood stocks!\n\n⚡ Next update in ${nextResetMinutes}m ${nextResetSeconds}s (5s before reset)...`, threadID);

        const scheduleNextUpdate = () => {
            const session = activeSessions.get(senderID);
            if (!session) return;
            
            const msUntilReset = getMillisecondsUntilGearReset();
                            console.log(`[${new Date().toISOString()}] Scheduling next update in ${Math.floor(msUntilReset / 1000)}s (5s before gear reset) for user ${senderID}`);
            
            session.timeout = setTimeout(() => {
                fetchAll();
                scheduleNextUpdate();
            }, msUntilReset);
        };

        const fetchAll = async () => {
            try {
                const session = activeSessions.get(senderID);
                if (!session) return;

                console.log(`[${new Date().toISOString()}] Fetching V2 data for user ${senderID} - 5s before gear reset...`);

                const stockRes = await axios.get("https://growagarden.gg/api/ws/stocks.getAll?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D", {
                    timeout: 15000,
                    headers: {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9",
                        "priority": "u=1, i",
                        "referer": "https://growagarden.gg/stocks",
                        "trpc-accept": "application/json",
                        "x-trpc-source": "gag",
                        "User-Agent": "GAG-Bot-V2/1.0"
                    }
                });

                const weatherRes = await axios.get("https://growagarden.gg/api/v1/weather/gag", {
                    timeout: 15000,
                    headers: {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9",
                        "priority": "u=1, i",
                        "referer": "https://growagarden.gg/weather",
                        "Content-Length": "0"
                    }
                });

                const stockData = stockRes.data[0]?.result?.data?.json;
                const weatherData = weatherRes.data;

                console.log("Weather API Response:", JSON.stringify(weatherData, null, 2));

                if (!stockData) {
                    throw new Error("Invalid stock data structure from API");
                }

                session.updateCount = (session.updateCount || 0) + 1;

                const now = Date.now();
                const runningTime = Math.floor((now - session.startTime) / 1000 / 60);
                const updateCount = session.updateCount;

                const getPHTime = (timestamp) => {
                    return new Date(timestamp).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                        weekday: "short",
                    });
                };

                const getRelativeTime = (timestamp) => {
                    const diffSeconds = Math.floor((now - timestamp) / 1000);
                    if (diffSeconds < 60) return `${diffSeconds}s ago`;
                    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
                    return `${Math.floor(diffSeconds / 3600)}h ago`;
                };

                const calculateGearReset = () => {
                    const nowDate = new Date(now);
                    const currentMinutes = nowDate.getMinutes();
                    const currentSeconds = nowDate.getSeconds();
                    
                    const totalCurrentSeconds = (currentMinutes * 60) + currentSeconds;
                    const resetIntervalSeconds = 5 * 60;
                    
                    const secondsSinceLastReset = totalCurrentSeconds % resetIntervalSeconds;
                    const secondsUntilNextReset = resetIntervalSeconds - secondsSinceLastReset;
                    
                    const minutes = Math.floor(secondsUntilNextReset / 60);
                    const seconds = secondsUntilNextReset % 60;
                    return `${minutes}m ${seconds}s`;
                };

                const calculateEggReset = () => {
                    const nowDate = new Date(now);
                    const currentMinutes = nowDate.getMinutes();
                    const currentSeconds = nowDate.getSeconds();
                    
                    let minutesToNext30;
                    if (currentMinutes < 30) {
                        minutesToNext30 = 30 - currentMinutes;
                    } else {
                        minutesToNext30 = 60 - currentMinutes;
                    }
                    
                    const secondsUntilReset = currentSeconds === 0 ? 0 : 60 - currentSeconds;
                    const finalMinutes = secondsUntilReset === 0 ? minutesToNext30 : minutesToNext30 - 1;
                    
                    return `${finalMinutes}m ${secondsUntilReset}s`;
                };

                const calculateHoneyReset = () => {
                    const nowDate = new Date(now);
                    const currentMinutes = nowDate.getMinutes();
                    const currentSeconds = nowDate.getSeconds();
                    
                    const minutesUntilNextHour = currentMinutes === 0 && currentSeconds === 0 ? 60 : 60 - currentMinutes;
                    const secondsLeft = currentSeconds === 0 ? 0 : 60 - currentSeconds;
                    const finalMinutes = secondsLeft === 0 ? minutesUntilNextHour : minutesUntilNextHour - 1;
                    
                    if (currentMinutes === 0 && currentSeconds === 0) {
                        return "⚡ Resetting now!";
                    }
                    
                    return `${finalMinutes}m ${secondsLeft}s`;
                };

                const calculateCosmeticReset = () => {
                    const nowDate = new Date(now);
                    const currentHours = nowDate.getHours();
                    const currentMinutes = nowDate.getMinutes();
                    const currentSeconds = nowDate.getSeconds();
                    
                    const hoursUntilNext4H = 4 - (currentHours % 4);
                    const minutesLeft = currentMinutes === 0 ? 0 : 60 - currentMinutes;
                    const secondsLeft = currentSeconds === 0 ? 0 : 60 - currentSeconds;
                    
                    const finalHours = (minutesLeft === 0 && secondsLeft === 0) ? hoursUntilNext4H : hoursUntilNext4H - 1;
                    const finalMinutes = (secondsLeft === 0) ? minutesLeft : minutesLeft - 1;
                    
                    return `${finalHours}h ${finalMinutes}m ${secondsLeft}s`;
                };

                const formatStockList = (items, type) => {
                    if (!items || items.length === 0) return `❌ No ${type} available`;
                    return `📦 ${items.length} items:\n${items.map(item => `${item.name} x${item.value}`).join("\n")}`;
                };

                const gearResetText = calculateGearReset();
                const eggResetText = calculateEggReset();
                const cosmeticResetText = calculateCosmeticReset();
                const honeyResetText = calculateHoneyReset();

                const currentWeather = weatherData.currentWeather || weatherData.current || weatherData.weather || "Unknown";
                const cropBonuses = weatherData.cropBonuses || weatherData.bonus || weatherData.bonuses || "N/A";
                const weatherIcon = weatherData.icon || weatherData.emoji || "🌦️";

                const totalItems = (stockData.gearStock?.length || 0) + 
                                 (stockData.seedsStock?.length || 0) + 
                                 (stockData.eggStock?.length || 0) + 
                                 (stockData.cosmeticsStock?.length || 0) +
                                 (stockData.nightStock?.length || 0) +
                                 (stockData.bloodStock?.length || 0) +
                                 (stockData.honeyStock?.length || 0);

                const message = `🌾 𝗚𝗿𝗼𝘄 𝗔 𝗚𝗮𝗿𝗱𝗲𝗻 𝗩𝟮 — 𝗘𝗮𝗿𝗹𝘆 𝗥𝗲𝘀𝗲𝘁 𝗨𝗽𝗱𝗮𝘁𝗲 #${updateCount} 📊 ${totalItems} items\n\n` +
                    `🛠️ 𝗚𝗲𝗮𝗿:\n${formatStockList(stockData.gearStock, "gear")}\n\n` +
                    `🌱 𝗦𝗲𝗲𝗱𝘀:\n${formatStockList(stockData.seedsStock, "seeds")}\n\n` +
                    `🥚 𝗘𝗴𝗴𝘀:\n${formatStockList(stockData.eggStock, "eggs")}\n\n` +
                    `💄 𝗖𝗼𝘀𝗺𝗲𝘁𝗶𝗰𝘀:\n${formatStockList(stockData.cosmeticsStock, "cosmetics")}\n\n` +
                    `🍯 𝗛𝗼𝗻𝗲𝘆 𝗦𝘁𝗼𝗰𝗸:\n${formatStockList(stockData.honeyStock, "honey items")}\n\n` +
                    `🌙 𝗡𝗶𝗴𝗵𝘁 𝗦𝘁𝗼𝗰𝗸:\n${formatStockList(stockData.nightStock, "night items")}\n\n` +
                    `🩸 𝗕𝗹𝗼𝗼𝗱 𝗦𝘁𝗼𝗰𝗸:\n${formatStockList(stockData.bloodStock, "blood items")}\n\n` +
                    `🌤️ 𝗪𝗲𝗮𝘁𝗵𝗲𝗿: ${weatherIcon} ${currentWeather}\n🪴 𝗕𝗼𝗻𝘂𝘀: ${cropBonuses}\n\n` +
                    `⏰ 𝗡𝗘𝗫𝗧 𝗥𝗘𝗦𝗘𝗧𝗦:\n` +
                    `🛠️🌱 𝗚𝗲𝗮𝗿/𝗦𝗲𝗲𝗱𝘀: ${gearResetText}\n` +
                    `🥚 𝗘𝗴𝗴𝘀: ${eggResetText}\n` +
                    `💄 𝗖𝗼𝘀𝗺𝗲𝘁𝗶𝗰𝘀: ${cosmeticResetText}\n` +
                    `🍯 𝗛𝗼𝗻𝗲𝘆: ${honeyResetText}\n\n` +
                    `📊 𝗜𝗡𝗙𝗢:\n` +
                    `⏰ Running: ${runningTime}min | Update #${updateCount}\n` +
                    `🔄 Next update: ${gearResetText} (5s before gear reset) | 'growagardenv2 off' to stop\n` +
                    `🌐 API: growagarden.gg (Official)`;

                console.log(`[${new Date().toISOString()}] Sending V2 gear reset update #${updateCount} to user ${senderID}`);
                console.log("Available Stock Types:", Object.keys(stockData || {}));
                console.log("Weather Values:", { current: currentWeather, bonus: cropBonuses, icon: weatherIcon });
                api.sendMessage(message, threadID);

            } catch (err) {
                console.error("❌ V2 Fetch Error:", err.message);
                
                const session = activeSessions.get(senderID);
                if (session) {
                    session.updateCount = (session.updateCount || 0) + 1;
                    const nextResetMs = getMillisecondsUntilGearReset();
                    const nextResetMinutes = Math.floor(nextResetMs / 60000);
                    const nextResetSeconds = Math.floor((nextResetMs % 60000) / 1000);
                    api.sendMessage(`🚨 V2 Update #${session.updateCount} - API Error!\n\n❌ Could not fetch latest data from growagarden.gg\n⚠️ Official API might be down temporarily\n\n🔄 Will retry 5s before next gear reset in ${nextResetMinutes}m ${nextResetSeconds}s...\n\nUse 'growagardenv2 off' to stop if needed`, threadID);
                }
            }
        };

        activeSessions.set(senderID, { 
            timeout: null, 
            startTime: Date.now(),
            updateCount: 0 
        });

        scheduleNextUpdate();
        setTimeout(() => fetchAll(), 3000);
    }
};