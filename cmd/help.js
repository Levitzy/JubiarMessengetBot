const fs = require("fs");
const path = require("path");
const { admin_only } = require("./growagarden");

module.exports = {
    name: "help",
    description: "Shows all available commands or detailed info about a specific command",
    usage: "help [command_name]",
    admin_only: false,
    
    run: async ({ api, event, args, config, commands }) => {
        const { threadID } = event;
        const botPrefix = (config && typeof config.prefix === 'string') ? config.prefix : "";
        
        try {
            if (args.length > 0) {
                const commandName = args[0].toLowerCase();
                
                if (commands && commands.has(commandName)) {
                    const command = commands.get(commandName);
                    let helpText = `🔧 Command: ${command.name}\n`;
                    helpText += `📝 Description: ${command.description || "No description available"}\n`;
                    helpText += `💡 Usage: ${botPrefix}${command.usage || command.name}\n`;
                    
                    if (command.aliases && command.aliases.length > 0) {
                        helpText += `🔄 Aliases: ${command.aliases.join(", ")}\n`;
                    }
                    
                    return api.sendMessage(helpText, threadID);
                } else {
                    return api.sendMessage(`❌ Command "${commandName}" not found!\n\nUse "${botPrefix}help" to see all available commands.`, threadID);
                }
            }
            
            if (!commands || commands.size === 0) {
                return api.sendMessage("❌ No commands are currently loaded.", threadID);
            }
            
            let helpMessage = `🤖 **Bot Help Menu**\n`;
            helpMessage += `📋 Total Commands: ${commands.size}\n`;
            if (botPrefix) {
                helpMessage += `🔑 Prefix: "${botPrefix}"\n`;
            }
            helpMessage += `\n📚 **Available Commands:**\n\n`;
            
            const commandList = Array.from(commands.values()).sort((a, b) => a.name.localeCompare(b.name));
            
            commandList.forEach((command, index) => {
                const commandNumber = (index + 1).toString().padStart(2, '0');
                helpMessage += `${commandNumber}. ${botPrefix}${command.name}`;
                if (command.description) {
                    helpMessage += ` - ${command.description}`;
                }
                helpMessage += `\n`;
            });
            
            helpMessage += `\n💡 **Usage Tips:**\n`;
            helpMessage += `• Use "${botPrefix}help <command>" for detailed info\n`;
            helpMessage += `• Commands are case-insensitive\n`;
            if (botPrefix) {
                helpMessage += `• All commands must start with "${botPrefix}"\n`;
            }
            
            helpMessage += `\n🕒 Generated at: ${new Date().toLocaleString()}`;
            
            api.sendMessage(helpMessage, threadID);
            
        } catch (error) {
            console.error("Error in help command:", error);
            api.sendMessage("❌ An error occurred while generating the help menu. Please try again later.", threadID);
        }
    }
};