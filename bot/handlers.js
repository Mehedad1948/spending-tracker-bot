const bot = require('./instance');
const Expense = require('../models/Expense');
const { mainMenu, categoryMenu } = require('./keyboards');
const { formatCurrency, formatDate } = require('../utils/formatters');

// Temporary storage for user flow (e.g., waiting for category)
const userState = {};

const initBot = () => {

    // 1. Handle /start command
    bot.onText(/\/start/, (msg) => {
        bot.sendMessage(
            msg.chat.id,
            `👋 **Welcome to ExpenseTracker!**\n\nChoose an option below or just type an amount (e.g., "50000 Pizza"):`,
            {
                parse_mode: 'Markdown',
                ...mainMenu
            }
        );
    });

    // 2. Handle Text Messages
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (text.startsWith('/')) return;

        const parts = text.split(' ');
        const amount = parseFloat(parts[0]);

        if (!isNaN(amount)) {
            const description = parts.slice(1).join(' ') || 'General';

            userState[chatId] = { amount, description };

            await bot.sendMessage(
                chatId,
                `💰 Amount: ${formatCurrency(amount)}\n📝 Desc: ${description}\n\nSelect a Category:`,
                categoryMenu
            );
        }
    });

    // 3. Handle Callback Queries
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;

        try {
            await bot.answerCallbackQuery(query.id, { text: "Operation successful!" });
        } catch (e) {
            console.log("Callback query expired");
        }

        // CATEGORY
        if (data.startsWith('cat_')) {
            if (!userState[chatId]) {
                return bot.sendMessage(chatId, "⚠️ Session expired. Please enter amount again.");
            }

            const category = data.split('_')[1];
            const { amount, description } = userState[chatId];

            try {
                await Expense.create({ chatId, amount, description, category });
                delete userState[chatId];

                bot.sendMessage(
                    chatId,
                    `✅ **Saved!**\n${formatCurrency(amount)} for ${description} (${category})`,
                    { parse_mode: 'Markdown', ...mainMenu }
                );
            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, "❌ Error saving expense.");
            }
        }

        // REPORT TODAY
        if (data === 'report_today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const expenses = await Expense.find({
                chatId,
                date: { $gte: startOfDay }
            });

            const total = expenses.reduce((sum, item) => sum + item.amount, 0);

            bot.sendMessage(
                chatId,
                `📅 **Today's Spending:**\nTotal: ${formatCurrency(total)}`,
                { parse_mode: 'Markdown' }
            );
        }

        // REPORT MONTH
        if (data === 'report_month') {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const expenses = await Expense.find({
                chatId,
                date: { $gte: startOfMonth }
            });

            const total = expenses.reduce((sum, item) => sum + item.amount, 0);

            bot.sendMessage(
                chatId,
                `🗓 **This Month:**\nTotal: ${formatCurrency(total)}`,
                { parse_mode: 'Markdown' }
            );
        }

        // LAST 10
        if (data === 'report_last10') {
            const expenses = await Expense.find({ chatId })
                .sort({ date: -1 })
                .limit(10);

            if (expenses.length === 0) {
                bot.sendMessage(chatId, "📭 No expenses recorded yet.");
            } else {
                let msgText = "📈 **Last 10 Expenses:**\n\n";

                expenses.forEach((item, i) => {
                    msgText += `${i + 1}. **${formatCurrency(item.amount)}** - ${item.description}\n   _${item.category} | ${formatDate(item.date)}_\n`;
                });

                bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
            }
        }

        // HELP
        if (data === 'cmd_add_intro') {
            bot.sendMessage(
                chatId,
                "Simply type the amount and description.\nExample: `50 Coffee`",
                { parse_mode: 'Markdown' }
            );
        }

        // CLEAR
        if (data === 'cmd_clear_intro') {
            bot.sendMessage(
                chatId,
                "To clear your history, you would need to contact the admin (Feature safe-guarded)."
            );
        }
    }); // <-- FIXED closing bracket here

    console.log('🤖 Bot handlers loaded.');
};

module.exports = initBot;
