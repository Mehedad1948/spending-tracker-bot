const bot = require('./instance');
const Expense = require('../models/Expense');
const UserConfig = require('../models/UserConfig');
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
    if (prevPercent < 50 && currentPercent >= 50) alert = "⚠️ **هشتار:** شما از ۵۰٪ بودجه خود عبور کردید.";
    else if (prevPercent < 75 && currentPercent >= 75) alert = "⚠️ **هشدار:** شما از ۷۵٪ بودجه خود عبور کردید.";
    else if (prevPercent < 90 && currentPercent >= 90) alert = "🚨 **خطر:** شما ۹۰٪ بودجه خود را مصرف کرده‌اید!";
    else if (prevPercent < 100 && currentPercent >= 100) alert = "⛔ **بحرانی:** سقف بودجه ماهانه رد شد!";

    return {
        percent: currentPercent.toFixed(1),
        alert: alert
    };
};

// --- STATE MANAGEMENT ---
const userState = {};

const initBot = () => {

    // ... inside initBot() ...

    // --- WELCOME / HELP MESSAGE ---
    const sendWelcomeMessage = (chatId) => {
        const welcomeText = `
👋 **به دستیار هوشمند مدیریت هزینه خوش آمدید!**

من به شما کمک می‌کنم هزینه‌های خود را ثبت کنید، بودجه‌بندی کنید و گزارش‌های مالی بگیرید.

**🚀 روش‌های ثبت هزینه:**
1️⃣ **دستی:** مبلغ و توضیحات را تایپ کنید.
   • _مثال:_ \`50000 ناهار با علی\`
   • _مثال:_ \`20000 اسنپ\`

2️⃣ **پیامک بانکی:** پیامک‌های برداشت وجه را برای من فوروارد کنید. من مبلغ را خودکار تشخیص می‌دهم!

**💰 مدیریت بودجه:**
• یک سقف ماهانه تعیین کنید تا در صورت عبور از آن به شما هشدار دهم.
• از دکمه **"تعیین بودجه"** در منو استفاده کنید.

**📊 دستورات:**
/start - منوی اصلی
/budget - تنظیم سقف بودجه
/help - نمایش راهنما

👇 **از دکمه‌های زیر برای مشاهده گزارش‌ها استفاده کنید:**
        `;

        // Reset state to ensure clean start
        userState[chatId] = { step: 'IDLE' };

        bot.sendMessage(chatId, welcomeText, {
            parse_mode: 'Markdown',
            ...mainMenu // This attaches the buttons
        });
    };

    // 1. Handle /start
    bot.onText(/\/start/, (msg) => {
        sendWelcomeMessage(msg.chat.id);
    });

    // 2. Handle /help
    bot.onText(/\/help/, (msg) => {
        sendWelcomeMessage(msg.chat.id);
    });


    // 3. Handle /budget (Smart Handler)
    // Matches "/budget" AND "/budget 50000"
    bot.onText(/\/budget\s*(\d*)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const amountInput = match[1]; // The number part

        // Case A: User typed "/budget 500000" (Set it immediately)
        if (amountInput) {
            const budget = parseFloat(amountInput);
            await UserConfig.findOneAndUpdate(
                { chatId },
                { monthlyBudget: budget },
                { upsert: true, new: true }
            );
            return bot.sendMessage(chatId, `✅ **بودجه تنظیم شد!**\nسقف ماهانه: ${formatCurrency(budget)}`, { parse_mode: 'Markdown' });
        }

        // Case B: User typed only "/budget" (Show current status)
        const config = await UserConfig.findOne({ chatId });
        const currentBudget = config ? config.monthlyBudget : 0;

        if (currentBudget > 0) {
            bot.sendMessage(chatId, `📊 **بودجه فعلی شما:** ${formatCurrency(currentBudget)}\n\nبرای تغییر آن، دکمه "تعیین بودجه" را بزنید یا تایپ کنید:\n\`/budget 6000000\``, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `⚠️ **بودجه‌ای تنظیم نشده است.**\n\nبرای تنظیم، دکمه "تعیین بودجه" را بزنید یا تایپ کنید:\n\`/budget 5000000\``, { parse_mode: 'Markdown' });
        }
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
                return bot.sendMessage(chatId, "⚠️ مبلغ نامعتبر است. لطفاً عددی مانند `5000000` وارد کنید:");
            }

            await UserConfig.findOneAndUpdate(
                { chatId },
                { monthlyBudget: budget },
                { upsert: true, new: true }
            );

            userState[chatId] = { step: 'IDLE' }; // Reset state
            return bot.sendMessage(chatId, `✅ **بودجه بروزرسانی شد!**\nسقف ماهانه: ${formatCurrency(budget)}`, { parse_mode: 'Markdown', ...mainMenu });
        }


        // --- EDIT MODE ---
        if (state.step === 'EDIT_AMOUNT') {
            const newAmount = parseFloat(text.replace(/,/g, ''));
            if (isNaN(newAmount)) return bot.sendMessage(chatId, "⚠️ عدد نامعتبر است.");
            await Expense.findByIdAndUpdate(state.editId, { amount: newAmount });
            userState[chatId] = { step: 'IDLE' };
            return bot.sendMessage(chatId, `✅ مبلغ به ${formatCurrency(newAmount)} تغییر یافت.`, { ...mainMenu });
        }

        if (state.step === 'EDIT_DESC') {
            await Expense.findByIdAndUpdate(state.editId, { description: text });
            userState[chatId] = { step: 'IDLE' };
            return bot.sendMessage(chatId, `✅ توضیحات به "${text}" تغییر یافت.`, { ...mainMenu });
        }

        // --- NEW EXPENSE ENTRY ---
        let amount = 0;
        let description = 'عمومی';
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
                description = "ثبت خودکار پیامک بانک";
                isAutoDetected = true;
            }
        }

        if (amount > 0) {
            userState[chatId] = {
                step: 'WAIT_CATEGORY',
                tempData: { amount, description }
            };

            const msgText = isAutoDetected
                ? `📩 **پیامک شناسایی شد!**\n💰 مبلغ: ${formatCurrency(amount)}\n📝 بابت: ${description}\n\nیک دسته‌بندی انتخاب کنید:`
                : `💰 مبلغ: ${formatCurrency(amount)}\n📝 بابت: ${description}\n\nیک دسته‌بندی انتخاب کنید:`;

            await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown', ...categoryMenu });
        } else if (text.length < 20) {
            bot.sendMessage(chatId, "⚠️ فرمت ناخوانا. تلاش کنید: `50000 ناهار`\nیا تنظیم بودجه با: `/budget 100000`");
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
                return bot.sendMessage(chatId, "⚠️ نشست منقضی شده است. لطفا دوباره تلاش کنید.");
            }

            const category = data.split('_')[1]; // Note: Ensure categories in 'keyboards.js' match logic or are mapped properly
            const { amount, description } = state.tempData;

            try {
                await Expense.create({ chatId, amount, description, category });
                userState[chatId] = { step: 'IDLE' };

                // --- BUDGET CHECK LOGIC ---
                const budgetStatus = await checkBudgetStatus(chatId, amount);

                let finalText = `✅ **ذخیره شد!**\n${formatCurrency(amount)} | ${description} | ${category}`;

                // Add Budget Info if user has a budget set
                if (budgetStatus) {
                    finalText += `\n\n📊 **مصرف بودجه:** %${budgetStatus.percent}`;

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
                bot.sendMessage(chatId, "❌ خطا در ذخیره هزینه.");
            }
        }

        // --- CHARTS ---
        if (data === 'report_charts') {
            const startOfMonth = new Date();
            startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
            const expenses = await Expense.find({ chatId, date: { $gte: startOfMonth } });

            if (expenses.length === 0) return bot.sendMessage(chatId, "📭 داده‌ای برای این ماه موجود نیست.");

            bot.sendMessage(chatId, "📊 در حال تولید نمودارها...");
            const pieBuffer = await generateCategoryPie(expenses);
            if (pieBuffer) await bot.sendPhoto(chatId, pieBuffer, { caption: 'هزینه بر اساس دسته‌بندی' });

            const barBuffer = await generateDailyBar(expenses);
            if (barBuffer) await bot.sendPhoto(chatId, barBuffer, { caption: 'روند هزینه روزانه' });
        }

        // --- LAST 10 ---
        if (data === 'report_last10') {
            const expenses = await Expense.find({ chatId }).sort({ date: -1 }).limit(10);
            if (expenses.length === 0) return bot.sendMessage(chatId, "📭 هزینه‌ای ثبت نشده است.");

            const inlineKeyboard = expenses.map((item) => {
                return [{
                    text: `${formatCurrency(item.amount)} - ${item.description}`,
                    callback_data: `edit_sel_${item._id}`
                }];
            });
            bot.sendMessage(chatId, "✏️ **برای ویرایش یا حذف، روی آیتم بزنید:**", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        }

        if (data === 'cmd_set_budget') {
            userState[chatId] = { step: 'WAIT_BUDGET' };
            bot.sendMessage(chatId, "💰 **تنظیم بودجه ماهانه**\n\nلطفا کل مبلغ بودجه این ماه خود را تایپ کنید (مثلا: `5000000`):", { parse_mode: 'Markdown' });
        }

        // --- EDITING ---
        if (data.startsWith('edit_sel_')) {
            const expenseId = data.split('_')[2];
            const item = await Expense.findById(expenseId);
            if (!item) return bot.sendMessage(chatId, "❌ آیتم پیدا نشد.");

            bot.sendMessage(chatId, `انتخاب شد: **${item.description}** (${formatCurrency(item.amount)})`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✏️ مبلغ", callback_data: `edit_act_amt_${expenseId}` }, { text: "📝 توضیحات", callback_data: `edit_act_desc_${expenseId}` }],
                        [{ text: "🗑 حذف کردن", callback_data: `edit_act_del_${expenseId}` }]
                    ]
                }
            });
        }

        if (data.startsWith('edit_act_del_')) {
            await Expense.findByIdAndDelete(data.split('_')[3]);
            bot.sendMessage(chatId, "🗑 حذف شد.", { ...mainMenu });
        }
        if (data.startsWith('edit_act_amt_')) {
            userState[chatId] = { step: 'EDIT_AMOUNT', editId: data.split('_')[3] };
            bot.sendMessage(chatId, "🔢 مبلغ جدید را وارد کنید:");
        }
        if (data.startsWith('edit_act_desc_')) {
            userState[chatId] = { step: 'EDIT_DESC', editId: data.split('_')[3] };
            bot.sendMessage(chatId, "📝 توضیحات جدید را وارد کنید:");
        }

        if (data === 'cmd_clear_intro') {
            bot.sendMessage(chatId, "🗑 **گزینه‌های حذف**\nچه چیزی را می‌خواهید پاک کنید؟", {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📅 امروز', callback_data: 'ask_del_today' },
                            { text: '🗓 این هفته', callback_data: 'ask_del_week' }
                        ],
                        [
                            { text: '📆 این ماه', callback_data: 'ask_del_month' },
                            { text: '🚨 همه چیز (پاکسازی کامل)', callback_data: 'ask_del_all' }
                        ],
                        [{ text: '🔙 انصراف', callback_data: 'act_clear_cancel' }]
                    ]
                }
            });
        }

        // 2. Confirmation Step: "Are you sure?"
        if (data.startsWith('ask_del_')) {
            const type = data.split('_')[2]; // today, week, month, all
            let warningText = "";

            if (type === 'today') warningText = "آیا مطمئنید که می‌خواهید هزینه‌های **امروز** را حذف کنید؟";
            if (type === 'week') warningText = "آیا مطمئنید که می‌خواهید هزینه‌های **این هفته** را حذف کنید؟";
            if (type === 'month') warningText = "آیا مطمئنید که می‌خواهید هزینه‌های **این ماه** را حذف کنید؟";
            if (type === 'all') warningText = "⚠️ **خطر:** آیا مطمئنید که می‌خواهید **کل تاریخچه** را حذف کنید؟";

            bot.editMessageText(warningText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ بله، حذف کن', callback_data: `act_del_${type}` }],
                        [{ text: '🔙 انصراف', callback_data: 'act_clear_cancel' }]
                    ]
                }
            });
        }

        // 3. Execution Step: Actually Delete from DB
        if (data.startsWith('act_del_')) {
            const type = data.split('_')[2];
            let query = { chatId }; // Default: matches user
            let timeDesc = "";

            const now = new Date();

            if (type === 'today') {
                now.setHours(0, 0, 0, 0);
                query.date = { $gte: now };
                timeDesc = "امروز";
            }
            else if (type === 'week') {
                // Calculate start of week (assuming Sunday start)
                const day = now.getDay(); // 0 (Sun) to 6 (Sat)
                const diff = now.getDate() - day;
                now.setDate(diff);
                now.setHours(0, 0, 0, 0);

                query.date = { $gte: now };
                timeDesc = "این هفته";
            }
            else if (type === 'month') {
                now.setDate(1);
                now.setHours(0, 0, 0, 0);
                query.date = { $gte: now };
                timeDesc = "این ماه";
            }
            else if (type === 'all') {
                // No date filter needed, it deletes everything for this chatId
                timeDesc = "کل";
            }

            try {
                const result = await Expense.deleteMany(query);
                bot.sendMessage(chatId, `🗑 **حذف شد!**\nتعداد ${result.deletedCount} مورد از تاریخچه ${timeDesc} پاک شد.`, {
                    parse_mode: 'Markdown',
                    ...mainMenu
                });
            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, "❌ خطا در حذف اطلاعات.");
            }
        }

        // 4. Cancel Handler
        if (data === 'act_clear_cancel') {
            try { bot.deleteMessage(chatId, messageId); } catch (e) { }
            bot.sendMessage(chatId, "✅ عملیات لغو شد.", { ...mainMenu });
        }

        // --- OTHER ---
        if (data === 'report_today') {
            const start = new Date(); start.setHours(0, 0, 0, 0);
            const expenses = await Expense.find({ chatId, date: { $gte: start } });
            const total = expenses.reduce((sum, i) => sum + i.amount, 0);
            bot.sendMessage(chatId, `📅 **امروز:** ${formatCurrency(total)}`, { parse_mode: 'Markdown' });
        }
        if (data === 'report_month') {
            const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
            const expenses = await Expense.find({ chatId, date: { $gte: start } });
            const total = expenses.reduce((sum, i) => sum + i.amount, 0);
            bot.sendMessage(chatId, `🗓 **این ماه:** ${formatCurrency(total)}`, { parse_mode: 'Markdown' });
        }
        if (data === 'cmd_add_intro') bot.sendMessage(chatId, "تایپ کنید: `50000 ناهار`\nیا تنظیم بودجه: `/budget 5000000`", { parse_mode: 'Markdown' });
    });

    console.log('🤖 Bot handlers loaded (Persian).');
};

module.exports = initBot;
