module.exports = {
    name: "ping",
    description: "Simple ping command available to everyone",
    usage: "ping",
    admin_only: false,
    
    run: async ({ api, event, args, config, commands }) => {
        const { threadID } = event;
        const startTime = Date.now();
        
        api.sendMessage("🏓 Pong!", threadID, () => {
            const endTime = Date.now();
            const latency = endTime - startTime;
            api.sendMessage(`⚡ Response time: ${latency}ms`, threadID);
        });
    }
};