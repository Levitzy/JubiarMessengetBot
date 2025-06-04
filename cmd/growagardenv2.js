const axios = require("axios");

const activeSessions = new Map(); 

module.exports = {
    name: "growagardenv2",
    description: "Track Grow A Garden stock + weather on gear/seed resets using official growagarden.gg API",
    usage: "growagardenv2 on | off | status",
    aliases: ["gagv2", "gagstock2"],
    admin_only: true,
    
    run: async ({ api, event, args, config, commands }) => {
        const { threadID, senderID } = event;
        const action = args[0]?.toLowerCase();

        const getSecondsUntilGearReset = () => {
            const now = new Date();
            const currentMinutes = now.getMinutes();
            const currentSeconds = now.getSeconds();
            
            const totalCurrentSeconds = (currentMinutes * 60) + currentSeconds;
            const resetIntervalSeconds = 5 * 60;
            
            const secondsSinceLastReset = totalCurrentSeconds % resetIntervalSeconds;
            const secondsUntilNextReset = resetIntervalSeconds - secondsSinceLastReset;
            
            return secondsUntilNextReset;
        };

        if (action === "off") {
            const session = activeSessions.get(senderID);
            if (session) {
                if (session.timeout) clearTimeout(session.timeout);
                if (session.pollTimeout) clearTimeout(session.pollTimeout);
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
                const nextUpdateSeconds = getSecondsUntilGearReset() + 30;
                const nextUpdateTime = `${Math.floor(nextUpdateSeconds / 60)}m ${nextUpdateSeconds % 60}s`;
                return api.sendMessage(`📊 V2 Tracking Status: ACTIVE ✅\n\n⏱️ Running for: ${runningTime} minutes\n📈 Updates sent: ${updateCount}\n🔄 Next update: ${nextUpdateTime}\n\nUse 'growagardenv2 off' to stop`, threadID);
            } else {
                return api.sendMessage("❌ No active V2 tracking session.\n\nUse 'growagardenv2 on' to start tracking", threadID);
            }
        }

        if (action !== "on") {
            return api.sendMessage("📌 Usage:\n• `growagardenv2 on` - Start auto tracking\n• `growagardenv2 off` - Stop tracking\n• `growagardenv2 status` - Check status\n\n⚡ Uses official growagarden.gg API!\n🎯 Smart polling: Checks every 10s after resets until fresh data!", threadID);
        }

        if (activeSessions.has(senderID)) {
            return api.sendMessage("📡 You're already tracking Grow A Garden V2. Use `growagardenv2 off` to stop.", threadID);
        }

        const nextResetSeconds = getSecondsUntilGearReset() + 30;
        const nextResetTime = `${Math.floor(nextResetSeconds / 60)}m ${nextResetSeconds % 60}s`;
        
        api.sendMessage(`✅ Grow A Garden V2 auto-tracking started!\n\n🎯 Smart polling: 30s + continuous checks after resets\n🌐 Using official growagarden.gg API\n⏰ Reset times: Gear/Seeds (5min) | Eggs (30min) | Cosmetics (4h) | Honey (1h)\n🍯 Includes: Honey, Night & Blood stocks!\n🔄 Advanced cache-busting + polling enabled!\n\n⚡ Getting current data now...\n🔄 Next reset check in: ${nextResetTime}`, threadID);

        const scheduleNextFetch = () => {
            const session = activeSessions.get(senderID);
            if (!session) return;

            let secondsUntilFetch = getSecondsUntilGearReset() + 30;
            
            if (secondsUntilFetch < 35) {
                secondsUntilFetch += 300;
            }

            console.log(`[${new Date().toISOString()}] Next V2 fetch scheduled in ${secondsUntilFetch} seconds for user ${senderID}`);

            session.timeout = setTimeout(() => {
                startPollingForFreshData();
            }, secondsUntilFetch * 1000);
        };

        const startPollingForFreshData = async () => {
            const session = activeSessions.get(senderID);
            if (!session) return;

            console.log(`[${new Date().toISOString()}] Starting polling for fresh data for user ${senderID}`);
            
            let pollAttempts = 0;
            const maxPolls = 6;
            
            const pollForChanges = async () => {
                if (!activeSessions.has(senderID)) return;
                
                pollAttempts++;
                console.log(`[${new Date().toISOString()}] Polling attempt ${pollAttempts}/${maxPolls} for user ${senderID}`);
                
                try {
                    const freshData = await fetchStockData();
                    if (freshData) {
                        const currentFingerprint = JSON.stringify({
                            gear: freshData.stockData.gearStock?.map(item => `${item.name}:${item.value}`).sort(),
                            seeds: freshData.stockData.seedsStock?.map(item => `${item.name}:${item.value}`).sort()
                        });
                        
                        if (!session.lastStockFingerprint || session.lastStockFingerprint !== currentFingerprint) {
                            console.log(`[${new Date().toISOString()}] Fresh data detected for user ${senderID}!`);
                            session.lastStockFingerprint = currentFingerprint;
                            sendStockUpdate(freshData.stockData, freshData.weatherData);
                            scheduleNextFetch();
                            return;
                        }
                        
                        console.log(`[${new Date().toISOString()}] Still same data for user ${senderID}, attempt ${pollAttempts}`);
                    }
                } catch (err) {
                    console.error(`[${new Date().toISOString()}] Polling error for user ${senderID}:`, err.message);
                }
                
                if (pollAttempts < maxPolls) {
                    session.pollTimeout = setTimeout(pollForChanges, 10000);
                } else {
                    console.log(`[${new Date().toISOString()}] Max polling attempts reached for user ${senderID}, sending current data`);
                    try {
                        const finalData = await fetchStockData();
                        if (finalData) {
                            sendStockUpdate(finalData.stockData, finalData.weatherData, true);
                        }
                    } catch (err) {
                        console.error(`[${new Date().toISOString()}] Final fetch error for user ${senderID}:`, err.message);
                    }
                    scheduleNextFetch();
                }
            };
            
            pollForChanges();
        };

        const fetchStockData = async () => {
            const timestamp = Date.now();
            const randomParam = Math.random().toString(36).substring(7);
            
            const stockRes = await axios.get(`https://growagarden.gg/api/ws/stocks.getAll?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D&_=${timestamp}&r=${randomParam}`, {
                timeout: 15000,
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "priority": "u=1, i",
                    "referer": "https://growagarden.gg/stocks",
                    "trpc-accept": "application/json",
                    "x-trpc-source": "gag",
                    "User-Agent": `GAG-Bot-V2/1.0-${randomParam}-${timestamp}`,
                    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "Thu, 01 Jan 1970 00:00:00 GMT",
                    "X-Requested-With": "XMLHttpRequest",
                    "X-Cache-Buster": timestamp.toString(),
                    "If-None-Match": "*",
                    "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT"
                }
            });

            const weatherRes = await axios.get(`https://growagarden.gg/api/v1/weather/gag?_=${timestamp}&r=${randomParam}`, {
                timeout: 15000,
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "priority": "u=1, i",
                    "referer": "https://growagarden.gg/weather",
                    "Content-Length": "0",
                    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "Thu, 01 Jan 1970 00:00:00 GMT",
                    "X-Cache-Buster": timestamp.toString(),
                    "If-None-Match": "*",
                    "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT"
                }
            });

            const stockData = stockRes.data[0]?.result?.data?.json;
            const weatherData = weatherRes.data;

            if (!stockData) {
                throw new Error("Invalid stock data structure from API");
            }

            return { stockData, weatherData };
        };

        const sendStockUpdate = (stockData, weatherData, isMaxRetry = false) => {
            const session = activeSessions.get(senderID);
            if (!session) return;

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

            const nextUpdateSeconds = getSecondsUntilGearReset() + 30;
            const nextUpdateText = `${Math.floor(nextUpdateSeconds / 60)}m ${nextUpdateSeconds % 60}s`;

            const updateType = updateCount === 1 ? "𝗟𝗶𝘃𝗲" : isMaxRetry ? "𝗙𝗼𝗿𝗰𝗲𝗱" : "𝗙𝗿𝗲𝘀𝗵";
            const message = `🌾 𝗚𝗿𝗼𝘄 𝗔 𝗚𝗮𝗿𝗱𝗲𝗻 𝗩𝟮 — ${updateType} 𝗨𝗽𝗱𝗮𝘁𝗲 #${updateCount} 📊 ${totalItems} items\n\n` +
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
                `🔄 Next check: ${nextUpdateText} | 'growagardenv2 off' to stop\n` +
                `🌐 API: growagarden.gg (Official)`;

            console.log(`[${new Date().toISOString()}] Sending V2 update #${updateCount} to user ${senderID} (${updateType})`);
            api.sendMessage(message, threadID);
        };

        activeSessions.set(senderID, { 
            timeout: null,
            pollTimeout: null,
            startTime: Date.now(),
            updateCount: 0,
            lastStockFingerprint: null
        });

        setTimeout(async () => {
            try {
                const initialData = await fetchStockData();
                if (initialData) {
                    const initialFingerprint = JSON.stringify({
                        gear: initialData.stockData.gearStock?.map(item => `${item.name}:${item.value}`).sort(),
                        seeds: initialData.stockData.seedsStock?.map(item => `${item.name}:${item.value}`).sort()
                    });
                    
                    const session = activeSessions.get(senderID);
                    if (session) {
                        session.lastStockFingerprint = initialFingerprint;
                        sendStockUpdate(initialData.stockData, initialData.weatherData);
                        scheduleNextFetch();
                    }
                }
            } catch (err) {
                console.error("Initial fetch error:", err.message);
                api.sendMessage("❌ Failed to get initial data. Will retry on next scheduled check.", threadID);
                scheduleNextFetch();
            }
        }, 3000);
    }
};