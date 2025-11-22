const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Set commands with Persian descriptions
bot.setMyCommands([
    { command: '/start', description: '🏠 منوی اصلی و شروع مجدد' },
    { command: '/budget', description: '💰 تعیین بودجه ماهانه' },
    { command: '/help', description: '📚 راهنمای استفاده' }
]);

module.exports = bot;