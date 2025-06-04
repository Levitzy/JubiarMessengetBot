const axios = require("axios");

const activeSessions = new Map(); 

module.exports = {
    name: "growagarden",
    description: "Track Grow A Garden stock + weather every 30s (sends updates every 30s)",
    usage: "growagarden on | off | status",
    aliases: ["gag", "gagstock"],
    admin_only: true,
    
    run: async ({ api, event, args, config, commands }) => {
        const { threadID, senderID } = event;
        const action = args[0]?.toLowerCase();

        if (action === "off") {
            const session = activeSessions.get(senderID);
            if (session) {
                clearInterval(session.interval);
                const runningTime = Math.floor((Date.now() - session.startTime) / 1000 / 60);
                const updateCount = session.updateCount || 0;
                activeSessions.delete(senderID);
                return api.sendMessage(`🛑 Grow A Garden tracking stopped.\n\n📊 Final Stats:\n⏱️ Ran for: ${runningTime} minutes\n📈 Updates sent: ${updateCount}`, threadID);
            } else {
                return api.sendMessage("⚠️ You don't have an active tracking session.", threadID);
            }
        }

        if (action === "status") {
            const session = activeSessions.get(senderID);
            if (session) {
                const runningTime = Math.floor((Date.now() - session.startTime) / 1000 / 60);
                const updateCount = session.updateCount || 0;
                const nextCheck = 30 - (Math.floor(Date.now() / 1000) % 30);
                return api.sendMessage(`📊 Tracking Status: ACTIVE ✅\n\n⏱️ Running for: ${runningTime} minutes\n📈 Updates sent: ${updateCount}\n🔄 Next update: ${nextCheck}s\n\nUse 'growagarden off' to stop`, threadID);
            } else {
                return api.sendMessage("❌ No active tracking session.\n\nUse 'growagarden on' to start tracking", threadID);
            }
        }

        if (action !== "on") {
            return api.sendMessage("📌 Usage:\n• `growagarden on` - Start auto tracking\n• `growagarden off` - Stop tracking\n• `growagarden status` - Check status\n\n⚡ Sends updates every 30 seconds!", threadID);
        }

        if (activeSessions.has(senderID)) {
            return api.sendMessage("📡 You're already tracking Grow A Garden. Use `growagarden off` to stop.", threadID);
        }

        api.sendMessage("✅ Grow A Garden auto-tracking started!\n\n🔄 Will send updates every 30 seconds\n⏰ Reset times: Gear/Seeds (5min) | Eggs (30min)\n\n⚡ First update coming in 5 seconds...", threadID);

        const fetchAll = async () => {
            try {
                const session = activeSessions.get(senderID);
                if (!session) return;

                console.log(`[${new Date().toISOString()}] Fetching data for user ${senderID}...`);

                const gearSeedRes = await axios.get("https://growagardenstock.com/api/stock?type=gear-seeds", { timeout: 15000 });
                const eggRes = await axios.get("https://growagardenstock.com/api/stock?type=egg", { timeout: 15000 });
                const weatherRes = await axios.get("https://growagardenstock.com/api/stock/weather", { timeout: 15000 });
                const cosmeticsRes = await axios.get("https://growagardenstock.com/api/special-stock?type=cosmetics", { timeout: 15000 });

                const gearSeed = gearSeedRes.data;
                const egg = eggRes.data;
                const weather = weatherRes.data;
                const cosmetics = cosmeticsRes.data;

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

                const formatStockList = (items, type) => {
                    if (!items || items.length === 0) return `❌ No ${type} available`;
                    return `📦 ${items.length} items:\n${items.join("\n")}`;
                };

                const gearTime = getPHTime(gearSeed.updatedAt);
                const gearRelative = getRelativeTime(gearSeed.updatedAt);
                const gearResetText = calculateGearReset();

                const eggTime = getPHTime(egg.updatedAt);
                const eggRelative = getRelativeTime(egg.updatedAt);
                const eggResetText = calculateEggReset();

                const cosmeticsTime = getPHTime(cosmetics.updatedAt);
                const cosmeticsRelative = getRelativeTime(cosmetics.updatedAt);

                const weatherIcon = weather.icon || "🌦️";
                const weatherDesc = weather.currentWeather || "Unknown";
                const weatherBonus = weather.cropBonuses || "N/A";

                const totalItems = (gearSeed.gear?.length || 0) + (gearSeed.seeds?.length || 0) + (egg.egg?.length || 0) + (cosmetics.cosmetics?.length || 0);

                const message = `🌾 𝗚𝗿𝗼𝘄 𝗔 𝗚𝗮𝗿𝗱𝗲𝗻 — 𝗔𝘂𝘁𝗼 𝗨𝗽𝗱𝗮𝘁𝗲 #${updateCount} 📊 ${totalItems} items\n\n` +
                    `🛠️ 𝗚𝗲𝗮𝗿:\n${formatStockList(gearSeed.gear, "gear")}\n\n` +
                    `🌱 𝗦𝗲𝗲𝗱𝘀:\n${formatStockList(gearSeed.seeds, "seeds")}\n\n` +
                    `🥚 𝗘𝗴𝗴𝘀:\n${formatStockList(egg.egg, "eggs")}\n\n` +
                    `💄 𝗖𝗼𝘀𝗺𝗲𝘁𝗶𝗰𝘀:\n${formatStockList(cosmetics.cosmetics, "cosmetics")}\n\n` +
                    `🌤️ 𝗪𝗲𝗮𝘁𝗵𝗲𝗿: ${weatherIcon} ${weatherDesc}\n🪴 𝗕𝗼𝗻𝘂𝘀: ${weatherBonus}\n\n` +
                    `⏰ 𝗡𝗘𝗫𝗧 𝗥𝗘𝗦𝗘𝗧𝗦:\n` +
                    `🛠️🌱 𝗚𝗲𝗮𝗿/𝗦𝗲𝗲𝗱𝘀: ${gearResetText}\n` +
                    `🥚 𝗘𝗴𝗴𝘀: ${eggResetText}\n\n` +
                    `📊 𝗜𝗡𝗙𝗢:\n` +
                    `⏰ Running: ${runningTime}min | Update #${updateCount}\n` +
                    `🔄 Next update: 30s | 'growagarden off' to stop`;

                console.log(`[${new Date().toISOString()}] Sending update #${updateCount} to user ${senderID}`);
                api.sendMessage(message, threadID);

            } catch (err) {
                console.error("❌ Fetch Error:", err.message);
                
                const session = activeSessions.get(senderID);
                if (session) {
                    session.updateCount = (session.updateCount || 0) + 1;
                    api.sendMessage(`🚨 Update #${session.updateCount} - API Error!\n\n❌ Could not fetch latest data\n⚠️ APIs might be down temporarily\n\n🔄 Will retry in 30 seconds...\n\nUse 'growagarden off' to stop if needed`, threadID);
                }
            }
        };

        const interval = setInterval(fetchAll, 30 * 1000);
        activeSessions.set(senderID, { 
            interval, 
            startTime: Date.now(),
            updateCount: 0 
        });

        setTimeout(() => fetchAll(), 5000);
    }
};