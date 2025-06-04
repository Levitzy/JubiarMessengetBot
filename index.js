const fca = require("ws3-fca");
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let config;
const configPath = path.join(__dirname, "config.json");
try {
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } else {
        console.warn("config.json not found. Using default empty config.");
        config = {};
    }
} catch (e) {
    console.error("Failed to load or parse config.json. Please ensure it exists and is valid JSON.");
    process.exit(1);
}

const appStatePath = path.join(__dirname, "appstate.json");
let appState = null;
try {
    if (fs.existsSync(appStatePath)) {
        const appStateFileContent = fs.readFileSync(appStatePath, "utf-8");
        if (appStateFileContent && appStateFileContent.trim() !== "") {
            const parsedAppState = JSON.parse(appStateFileContent);
            if (Array.isArray(parsedAppState) && parsedAppState.length > 0) {
                appState = parsedAppState;
            } else if (typeof parsedAppState === 'object' && parsedAppState !== null && Object.keys(parsedAppState).length === 0) {
                console.warn("appstate.json contained an empty object. Treating as null for fresh login attempt.");
                appState = null;
            } else if (Array.isArray(parsedAppState) && parsedAppState.length === 0) {
                 console.warn("appstate.json contained an empty array. Treating as null for fresh login attempt.");
                 appState = null;
            } else {
                appState = parsedAppState;
            }
        } else {
            console.warn("appstate.json is empty. Bot will attempt to log in and create/update it.");
            appState = null;
        }
    }
} catch (e) {
    console.warn("appstate.json found but could not be parsed. The bot will attempt to log in and create/update it.");
    appState = null;
}

const commands = new Map();
const cmdDir = path.join(__dirname, "cmd");

if (!fs.existsSync(cmdDir)) {
    console.warn(`Commands directory "${cmdDir}" not found. No commands will be loaded.`);
    try {
        fs.mkdirSync(cmdDir);
        console.log(`Created directory: ${cmdDir}`);
    } catch (mkdirErr) {
        console.error(`Failed to create commands directory "${cmdDir}":`, mkdirErr);
    }
} else {
    try {
        const files = fs.readdirSync(cmdDir);
        files.forEach(file => {
            if (file.endsWith(".js")) {
                try {
                    const commandName = path.basename(file, ".js").toLowerCase();
                    const commandModule = require(path.join(cmdDir, file));
                    if (commandModule && typeof commandModule.run === 'function') {
                        commands.set(commandName, commandModule);
                        console.log(`Loaded command: ${commandName}`);
                    } else {
                        console.warn(`Command ${commandName} in ${file} is missing a 'run' function or module is invalid.`);
                    }
                } catch (loadErr) {
                    console.error(`Failed to load command from ${file}:`, loadErr);
                }
            }
        });
    } catch (readDirErr) {
        console.error(`Failed to read commands directory "${cmdDir}":`, readDirErr);
    }
}

let api = null;

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot_logged_in: !!api,
        commands_loaded: commands.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json({
        bot_status: api ? 'connected' : 'disconnected',
        user_id: api ? api.getCurrentUserID() : null,
        commands: Array.from(commands.keys()),
        config_loaded: !!config
    });
});

app.post('/send-message', (req, res) => {
    if (!api) {
        return res.status(503).json({ error: 'Bot not logged in' });
    }
    
    const { threadID, message } = req.body;
    if (!threadID || !message) {
        return res.status(400).json({ error: 'threadID and message are required' });
    }
    
    api.sendMessage(message, threadID, (err, messageInfo) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to send message', details: err });
        }
        res.json({ success: true, messageInfo });
    });
});

app.get('/commands', (req, res) => {
    res.json({
        commands: Array.from(commands.keys()),
        total: commands.size
    });
});

const PORT = 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Express server running on http://${HOST}:${PORT}`);
});

console.log("Attempting to log in...");
fca.login(appState, (err, fbApi) => {
    if (err) {
        if (err.error === 'login-approval' || (err.message && err.message.includes("login approval"))) {
            console.error("LOGIN APPROVAL NEEDED: Please check your Facebook account for a login approval request. You might need to approve it from a recognized device or browser. After approving, try running the bot again.");
            console.error("Alternatively, generate an appstate.json file manually using a trusted method and place it in the bot's directory.");
        } else if (err.error && (typeof err.error === 'string' && err.error.includes("checkpoint"))) {
            console.error("FACEBOOK CHECKPOINT: Your account has been checkpointed. Please log in to Facebook via a browser and resolve the checkpoint, then try again.");
        } else {
            console.error("Login failed:", err.error || err);
        }
        return process.exit(1);
    }

    api = fbApi;
    console.log("Logged in successfully as", api.getCurrentUserID());
    try {
        fs.writeFileSync(appStatePath, JSON.stringify(api.getAppState(), null, 2), 'utf8');
        console.log("appstate.json has been updated/created successfully.");
    } catch (writeErr) {
        console.error("Failed to write appstate.json:", writeErr);
    }

    api.setOptions({ listenEvents: true, selfListen: false, logLevel: "silent" });

    const listener = api.listenMqtt((listenErr, event) => {
        if (listenErr) {
            console.error("Listen MQTT error:", listenErr);
            if (listenErr.error === 'Not logged in' || (listenErr.message && listenErr.message.toLowerCase().includes('connection closed'))) {
                console.error("Disconnected. Attempting to log in again might be necessary or check your internet connection. Exiting for now.");
                process.exit(1);
            }
            return;
        }

        try {
            const currentAppState = api.getAppState();
            if (currentAppState) {
                 fs.writeFileSync(appStatePath, JSON.stringify(currentAppState, null, 2), 'utf8');
            }
        } catch (writeErr) {
             console.warn("Could not update appstate.json during listen:", writeErr.message);
        }

        if (event && (event.type === "message" || event.type === "message_reply")) {
            if (!event.body || !event.senderID || event.senderID === api.getCurrentUserID()) {
                return;
            }

            const messageBody = event.body.trim();
            const botPrefix = (config && typeof config.prefix === 'string') ? config.prefix : "";

            let commandName;
            let args;
            let potentialCommand = "";

            if (botPrefix && messageBody.startsWith(botPrefix)) {
                potentialCommand = messageBody.substring(botPrefix.length).trim();
            } else if (!botPrefix) {
                potentialCommand = messageBody;
            } else {
                return;
            }

            if (!potentialCommand) return;

            const parts = potentialCommand.split(/\s+/);
            commandName = parts.shift()?.toLowerCase();
            args = parts;

            if (commandName && commands.has(commandName)) {
                const command = commands.get(commandName);
                try {
                    const targetThreadID = event.threadID || event.senderID;
                    const enhancedEvent = {
                        ...event,
                        threadID: targetThreadID,
                        isGroup: event.isGroup || (event.threadID && event.threadID.length > 15)
                    };
                    
                    command.run({ api, event: enhancedEvent, args, config, commands });
                } catch (cmdErr) {
                    console.error(`Error executing command ${commandName}:`, cmdErr);
                    const errorThreadID = event.threadID || event.senderID;
                    api.sendMessage(`An error occurred while running the command: ${commandName}. Check server logs.`, errorThreadID);
                }
            }
        }
    });
});