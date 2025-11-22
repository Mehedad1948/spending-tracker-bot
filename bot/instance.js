const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
bot.setMyCommands([
    { command: '/start', description: '🏠 Main Menu & Restart' },
    { command: '/budget', description: '💰 Set Monthly Budget' },
    { command: '/help', description: '📚 How to use this bot' }
]);
module.exports = bot;
