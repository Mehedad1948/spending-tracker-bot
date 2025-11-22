const bot = require('./instance');
const Expense = require('../models/Expense');
const { mainMenu, categoryMenu } = require('./keyboards');
const { formatCurrency, formatDate } = require('../utils/formatters');

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

// --- STATE MANAGEMENT ---
// Structure: { chatId: { step: 'IDLE' | 'WAIT_CATEGORY' | 'EDIT_AMOUNT' | 'EDIT_DESC', data: ... } }
const userState = {};

const initBot = () => {

    // 1. Handle /start command
    bot.onText(/\/start/, (msg) => {
        // Reset state on start
        userState[msg.chat.id] = { step: 'IDLE' };
        bot.sendMessage(
            msg.chat.id,
            `👋 **Welcome to ExpenseTracker!**\n\nType an amount (e.g., "50000 Pizza") or paste a Bank SMS:`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    });

    // 2. Handle Text Messages (Includes Edit Logic & Add Logic)
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text || text.startsWith('/')) return;

        // Initialize state if undefined
        if (!userState[chatId]) userState[chatId] = { step: 'IDLE' };
        const state = userState[chatId];

        // --- 🅰️ EDIT MODE LOGIC ---
        // If we are waiting for an edit input, handle it here and STOP.
        if (state.step === 'EDIT_AMOUNT') {
            const newAmount = parseFloat(text.replace(/,/g, ''));
            if (isNaN(newAmount)) return bot.sendMessage(chatId, "⚠️ Invalid number. Try again:");

            await Expense.findByIdAndUpdate(state.editId, { amount: newAmount });
            userState[chatId] = { step: 'IDLE' }; // Reset
            return bot.sendMessage(chatId, `✅ Amount updated to ${formatCurrency(newAmount)}`, { ...mainMenu });
        }

        if (state.step === 'EDIT_DESC') {
            await Expense.findByIdAndUpdate(state.editId, { description: text });
            userState[chatId] = { step: 'IDLE' }; // Reset
            return bot.sendMessage(chatId, `✅ Description updated to: ${text}`, { ...mainMenu });
        }

        // --- 🅱️ NEW EXPENSE LOGIC (Manual or SMS) ---
        let amount = 0;
        let description = 'General';
        let isAutoDetected = false;

        const firstWordClean = text.split(' ')[0].replace(/,/g, '');

        if (!isNaN(parseFloat(firstWordClean))) {
            // Manual Entry
            amount = parseFloat(firstWordClean);
            const descPart = text.split(' ').slice(1).join(' ');
            if (descPart) description = descPart;
        } else {
            // SMS Entry
            const smsAmount = parseBankSms(text);
            if (smsAmount) {
                amount = smsAmount;
                description = "Bank SMS Auto-Import";
                isAutoDetected = true;
            }
        }

        // If valid amount found
        if (amount > 0) {
            // Save temporary data and set state to wait for category
            userState[chatId] = { 
                step: 'WAIT_CATEGORY', 
                tempData: { amount, description } 
            };

            const msgText = isAutoDetected
                ? `📩 **SMS Detected!**\n💰 Amount: ${formatCurrency(amount)}\n📝 Desc: ${description}\n\nSelect a Category:`
                : `💰 Amount: ${formatCurrency(amount)}\n📝 Desc: ${description}\n\nSelect a Category:`;

            await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown', ...categoryMenu });
        } else if (text.length < 20) {
            bot.sendMessage(chatId, "⚠️ Unknown format. Try `50000 Food`");
        }
    });

    // 3. Handle Callback Queries (Buttons)
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const messageId = query.message.message_id;

        try { await bot.answerCallbackQuery(query.id); } catch (e) { }

        // --- CATEGORY SELECTION (Finishing a new expense) ---
        if (data.startsWith('cat_')) {
            const state = userState[chatId];
            if (!state || state.step !== 'WAIT_CATEGORY') {
                return bot.sendMessage(chatId, "⚠️ Session expired. Please enter amount again.");
            }

            const category = data.split('_')[1];
            const { amount, description } = state.tempData;

            try {
                await Expense.create({ chatId, amount, description, category });
                userState[chatId] = { step: 'IDLE' }; // Reset
                bot.editMessageText(`✅ **Saved!**\n${formatCurrency(amount)} | ${description} | ${category}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                });
            } catch (err) {
                bot.sendMessage(chatId, "❌ Error saving expense.");
            }
        }

        // --- REPORT: LAST 10 (Now with Edit Buttons) ---
        if (data === 'report_last10') {
            const expenses = await Expense.find({ chatId }).sort({ date: -1 }).limit(10);

            if (expenses.length === 0) return bot.sendMessage(chatId, "📭 No expenses recorded yet.");

            // Create a button for each expense
            const inlineKeyboard = expenses.map((item) => {
                return [{ 
                    text: `${formatCurrency(item.amount)} - ${item.description}`, 
                    callback_data: `edit_sel_${item._id}` // Store ID in button
                }];
            });

            bot.sendMessage(chatId, "✏️ **Tap an item to Edit or Delete:**", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        }

        // --- EDIT FLOW: SELECTION ---
        if (data.startsWith('edit_sel_')) {
            const expenseId = data.split('_')[2];
            const item = await Expense.findById(expenseId);
            
            if(!item) return bot.sendMessage(chatId, "❌ Item not found.");

            const actionsMarkup = {
                inline_keyboard: [
                    [
                        { text: "✏️ Edit Amount", callback_data: `edit_act_amt_${expenseId}` },
                        { text: "📝 Edit Desc", callback_data: `edit_act_desc_${expenseId}` }
                    ],
                    [
                        { text: "🗑 DELETE", callback_data: `edit_act_del_${expenseId}` }
                    ]
                ]
            };

            bot.sendMessage(chatId, `Selected: **${item.description}** (${formatCurrency(item.amount)})\nWhat do you want to do?`, {
                parse_mode: 'Markdown',
                reply_markup: actionsMarkup
            });
        }

         if (data === 'report_charts') {
            // 1. Fetch expenses for the current month (or last 30 days)
            const startOfMonth = new Date();
            startOfMonth.setDate(1); 
            startOfMonth.setHours(0,0,0,0);
            
            const expenses = await Expense.find({ 
                chatId, 
                date: { $gte: startOfMonth } 
            });

            if (expenses.length === 0) {
                return bot.sendMessage(chatId, "📭 No data this month to generate charts.");
            }

            bot.sendMessage(chatId, "🎨 Generating your charts, please wait...");

            // 2. Generate Pie Chart Image
            const pieBuffer = await generateCategoryPie(expenses);
            if (pieBuffer) {
                await bot.sendPhoto(chatId, pieBuffer, { caption: '📊 **Spending by Category**' });
            }

            // 3. Generate Bar Chart Image
            const barBuffer = await generateDailyBar(expenses);
            if (barBuffer) {
                await bot.sendPhoto(chatId, barBuffer, { caption: '📈 **Daily Spending Trend**' });
            }
        }


        // --- EDIT FLOW: ACTIONS ---
        // 1. Delete
        if (data.startsWith('edit_act_del_')) {
            const expenseId = data.split('_')[3];
            await Expense.findByIdAndDelete(expenseId);
            bot.sendMessage(chatId, "🗑 Item deleted permanently.", { ...mainMenu });
        }

        // 2. Edit Amount (Ask User)
        if (data.startsWith('edit_act_amt_')) {
            const expenseId = data.split('_')[3];
            userState[chatId] = { step: 'EDIT_AMOUNT', editId: expenseId };
            bot.sendMessage(chatId, "🔢 Please type the **new amount** now:");
        }

        // 3. Edit Description (Ask User)
        if (data.startsWith('edit_act_desc_')) {
            const expenseId = data.split('_')[3];
            userState[chatId] = { step: 'EDIT_DESC', editId: expenseId };
            bot.sendMessage(chatId, "📝 Please type the **new description** now:");
        }

        // --- OTHER REPORTS ---
        if (data === 'report_today') {
            const start = new Date(); start.setHours(0,0,0,0);
            const expenses = await Expense.find({ chatId, date: { $gte: start } });
            const total = expenses.reduce((sum, item) => sum + item.amount, 0);
            bot.sendMessage(chatId, `📅 **Today's Total:** ${formatCurrency(total)}`, { parse_mode: 'Markdown' });
        }

        if (data === 'report_month') {
            const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
            const expenses = await Expense.find({ chatId, date: { $gte: start } });
            const total = expenses.reduce((sum, item) => sum + item.amount, 0);
            bot.sendMessage(chatId, `🗓 **Month Total:** ${formatCurrency(total)}`, { parse_mode: 'Markdown' });
        }
        
        if (data === 'cmd_add_intro') {
            bot.sendMessage(chatId, "Type amount & desc:\n`50 Coffee`", { parse_mode: 'Markdown' });
        }
    });

    console.log('🤖 Bot handlers loaded.');
};

module.exports = initBot;
