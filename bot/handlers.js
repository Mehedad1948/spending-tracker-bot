const bot = require('./instance');
const Expense = require('../models/Expense');
const UserConfig = require('../models/UserConfig'); // <--- NEW IMPORT
const { mainMenu, categoryMenu } = require('./keyboards');
const { formatCurrency } = require('../utils/formatters');
const { generateCategoryPie, generateDailyBar } = require('../utils/chartBuilder');

// --- HELPERS ---

// 1. Bank SMS Parser
const parseBankSms = (text) => {
    const withdrawalKeywords = /برداشت|خرید|پرداخت|انتقال|Debit|Withdrawal/i;
    if (!withdrawalKeywords.test(text)) return null;
    const amountRegex = /(?:مبلغ|Amount)[:\s]*([0-9,]+)|([0-9,]+)\s*(?:ریال|Rial)/i;
    const match = text.match(amountRegex);
    if (match) {
        const rawValue = match[1] || match[2];
        return parseFloat(rawValue.replace(/,/g, ''));
    }
    return null;
};

// 2. Budget Checker Helper
const checkBudgetStatus = async (chatId, newExpenseAmount) => {
    const config = await UserConfig.findOne({ chatId });
    if (!config || config.monthlyBudget <= 0) return null; // No budget set

    // Get total for this month
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    const expenses = await Expense.find({ chatId, date: { $gte: start } });
    const totalSpent = expenses.reduce((sum, item) => sum + item.amount, 0);

    const limit = config.monthlyBudget;
    const currentPercent = (totalSpent / limit) * 100;

    // Calculate what the percent was BEFORE this specific expense (to detect crossing a line)
    const prevTotal = totalSpent - newExpenseAmount;
    const prevPercent = (prevTotal / limit) * 100;

    let alert = null;

    // Check Thresholds (Only alert if we just crossed the line)
    if (prevPercent < 50 && currentPercent >= 50) alert = "⚠️ **Alert:** You have passed 50% of your budget.";
    else if (prevPercent < 75 && currentPercent >= 75) alert = "⚠️ **Alert:** You have passed 75% of your budget.";
    else if (prevPercent < 90 && currentPercent >= 90) alert = "🚨 **WARNING:** You have passed 90% of your budget!";
    else if (prevPercent < 100 && currentPercent >= 100) alert = "⛔ **CRITICAL:** Budget Exceeded!";

    return {
        percent: currentPercent.toFixed(1),
        alert: alert
    };
};

// --- STATE MANAGEMENT ---
const userState = {};

const initBot = () => {

    // 1. Handle /start command
    bot.onText(/\/start/, (msg) => {
        userState[msg.chat.id] = { step: 'IDLE' };
        bot.sendMessage(
            msg.chat.id,
            `👋 **Welcome to ExpenseTracker!**\n\n1. To set a budget, type:\n/budget 5000000\n\n2. To add expense, type amount:\n50000 Lunch`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    });

    // 2. Handle /budget Command
    bot.onText(/\/budget (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const budget = parseFloat(match[1]);

        await UserConfig.findOneAndUpdate(
            { chatId },
            { monthlyBudget: budget },
            { upsert: true, new: true }
        );

        bot.sendMessage(chatId, `✅ **Monthly Budget Set!**\nLimit: ${formatCurrency(budget)}`, { parse_mode: 'Markdown' });
    });

    // 3. Handle Text Messages
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text || text.startsWith('/')) return;

        // Initialize state
        if (!userState[chatId]) userState[chatId] = { step: 'IDLE' };
        const state = userState[chatId];

        if (state.step === 'WAIT_BUDGET') {
            const budget = parseFloat(text.replace(/,/g, ''));

            if (isNaN(budget) || budget <= 0) {
                return bot.sendMessage(chatId, "⚠️ Invalid amount. Please type a number like `5000000`:");
            }

            await UserConfig.findOneAndUpdate(
                { chatId },
                { monthlyBudget: budget },
                { upsert: true, new: true }
            );

            userState[chatId] = { step: 'IDLE' }; // Reset state
            return bot.sendMessage(chatId, `✅ **Budget Updated!**\nMonthly Limit: ${formatCurrency(budget)}`, { parse_mode: 'Markdown', ...mainMenu });
        }


        // --- EDIT MODE ---
        if (state.step === 'EDIT_AMOUNT') {
            const newAmount = parseFloat(text.replace(/,/g, ''));
            if (isNaN(newAmount)) return bot.sendMessage(chatId, "⚠️ Invalid number.");
            await Expense.findByIdAndUpdate(state.editId, { amount: newAmount });
            userState[chatId] = { step: 'IDLE' };
            return bot.sendMessage(chatId, `✅ Amount updated to ${formatCurrency(newAmount)}`, { ...mainMenu });
        }

        if (state.step === 'EDIT_DESC') {
            await Expense.findByIdAndUpdate(state.editId, { description: text });
            userState[chatId] = { step: 'IDLE' };
            return bot.sendMessage(chatId, `✅ Description updated to: ${text}`, { ...mainMenu });
        }

        // --- NEW EXPENSE ENTRY ---
        let amount = 0;
        let description = 'General';
        let isAutoDetected = false;

        const firstWordClean = text.split(' ')[0].replace(/,/g, '');

        if (!isNaN(parseFloat(firstWordClean))) {
            amount = parseFloat(firstWordClean);
            const descPart = text.split(' ').slice(1).join(' ');
            if (descPart) description = descPart;
        } else {
            const smsAmount = parseBankSms(text);
            if (smsAmount) {
                amount = smsAmount;
                description = "Bank SMS Auto-Import";
                isAutoDetected = true;
            }
        }

        if (amount > 0) {
            userState[chatId] = {
                step: 'WAIT_CATEGORY',
                tempData: { amount, description }
            };

            const msgText = isAutoDetected
                ? `📩 **SMS Detected!**\n💰 Amount: ${formatCurrency(amount)}\n📝 Desc: ${description}\n\nSelect a Category:`
                : `💰 Amount: ${formatCurrency(amount)}\n📝 Desc: ${description}\n\nSelect a Category:`;

            await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown', ...categoryMenu });
        } else if (text.length < 20) {
            bot.sendMessage(chatId, "⚠️ Unknown format. Try `50000 Food`\nor set budget with `/budget 100000`");
        }
    });

    // 4. Handle Callbacks
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const messageId = query.message.message_id;

        try { await bot.answerCallbackQuery(query.id); } catch (e) { }

        // --- SAVE EXPENSE + BUDGET CHECK ---
        if (data.startsWith('cat_')) {
            const state = userState[chatId];
            if (!state || state.step !== 'WAIT_CATEGORY') {
                return bot.sendMessage(chatId, "⚠️ Session expired.");
            }

            const category = data.split('_')[1];
            const { amount, description } = state.tempData;

            try {
                await Expense.create({ chatId, amount, description, category });
                userState[chatId] = { step: 'IDLE' };

                // --- BUDGET CHECK LOGIC ---
                const budgetStatus = await checkBudgetStatus(chatId, amount);

                let finalText = `✅ **Saved!**\n${formatCurrency(amount)} | ${description} | ${category}`;

                // Add Budget Info if user has a budget set
                if (budgetStatus) {
                    finalText += `\n\n📊 **Budget Used:** ${budgetStatus.percent}%`;

                    // Add Alert if threshold crossed
                    if (budgetStatus.alert) {
                        finalText += `\n\n${budgetStatus.alert}`;
                    }
                }

                bot.editMessageText(finalText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                });

            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, "❌ Error saving expense.");
            }
        }

        // --- CHARTS ---
        if (data === 'report_charts') {
            const startOfMonth = new Date();
            startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
            const expenses = await Expense.find({ chatId, date: { $gte: startOfMonth } });
            console.log('🍎🍎 startOfMonth', startOfMonth);
            console.log('🎮🎮 expenses', expenses);

            if (expenses.length === 0) return bot.sendMessage(chatId, "📭 No data this month.");

            bot.sendMessage(chatId, "🎨 Generating charts...");
            const pieBuffer = await generateCategoryPie(expenses);
            if (pieBuffer) await bot.sendPhoto(chatId, pieBuffer, { caption: '📊 **Spending by Category**' });

            const barBuffer = await generateDailyBar(expenses);
            if (barBuffer) await bot.sendPhoto(chatId, barBuffer, { caption: '📈 **Daily Spending Trend**' });
        }

        // --- LAST 10 ---
        if (data === 'report_last10') {
            const expenses = await Expense.find({ chatId }).sort({ date: -1 }).limit(10);
            if (expenses.length === 0) return bot.sendMessage(chatId, "📭 No expenses.");

            const inlineKeyboard = expenses.map((item) => {
                return [{
                    text: `${formatCurrency(item.amount)} - ${item.description}`,
                    callback_data: `edit_sel_${item._id}`
                }];
            });
            bot.sendMessage(chatId, "✏️ **Tap item to Edit/Delete:**", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        }

        if (data === 'cmd_set_budget') {
            userState[chatId] = { step: 'WAIT_BUDGET' };
            bot.sendMessage(chatId, "💰 **Set Monthly Budget**\n\nPlease type your total budget limit for this month (e.g., `5000000`):", { parse_mode: 'Markdown' });
        }

        // --- EDITING ---
        if (data.startsWith('edit_sel_')) {
            const expenseId = data.split('_')[2];
            const item = await Expense.findById(expenseId);
            if (!item) return bot.sendMessage(chatId, "❌ Item not found.");

            bot.sendMessage(chatId, `Selected: **${item.description}** (${formatCurrency(item.amount)})`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✏️ Amount", callback_data: `edit_act_amt_${expenseId}` }, { text: "📝 Desc", callback_data: `edit_act_desc_${expenseId}` }],
                        [{ text: "🗑 DELETE", callback_data: `edit_act_del_${expenseId}` }]
                    ]
                }
            });
        }

        if (data.startsWith('edit_act_del_')) {
            await Expense.findByIdAndDelete(data.split('_')[3]);
            bot.sendMessage(chatId, "🗑 Deleted.", { ...mainMenu });
        }
        if (data.startsWith('edit_act_amt_')) {
            userState[chatId] = { step: 'EDIT_AMOUNT', editId: data.split('_')[3] };
            bot.sendMessage(chatId, "🔢 Enter new amount:");
        }
        if (data.startsWith('edit_act_desc_')) {
            userState[chatId] = { step: 'EDIT_DESC', editId: data.split('_')[3] };
            bot.sendMessage(chatId, "📝 Enter new description:");
        }

        // --- OTHER ---
        if (data === 'report_today') {
            const start = new Date(); start.setHours(0, 0, 0, 0);
            const expenses = await Expense.find({ chatId, date: { $gte: start } });
            const total = expenses.reduce((sum, i) => sum + i.amount, 0);
            bot.sendMessage(chatId, `📅 **Today:** ${formatCurrency(total)}`, { parse_mode: 'Markdown' });
        }
        if (data === 'report_month') {
            const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
            const expenses = await Expense.find({ chatId, date: { $gte: start } });
            const total = expenses.reduce((sum, i) => sum + i.amount, 0);
            bot.sendMessage(chatId, `🗓 **Month:** ${formatCurrency(total)}`, { parse_mode: 'Markdown' });
        }
        if (data === 'cmd_add_intro') bot.sendMessage(chatId, "Type: `50000 Food`\nOr set budget: `/budget 5000000`", { parse_mode: 'Markdown' });
    });

    console.log('🤖 Bot handlers loaded.');
};

module.exports = initBot;
