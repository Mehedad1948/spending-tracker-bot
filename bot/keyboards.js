// Main Menu Dashboard
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '➕ ثبت هزینه جدید', callback_data: 'cmd_add_intro' },
                { text: '💰 تعیین بودجه', callback_data: 'cmd_set_budget' }
            ],
            [
                { text: '📅 گزارش امروز', callback_data: 'report_today' },
                { text: '🗓 گزارش ماهانه', callback_data: 'report_month' }
            ],
            [
                { text: '📈 ۱۰ تراکنش آخر', callback_data: 'report_last10' },
                { text: '📊 گزارش‌های تصویری', callback_data: 'report_charts' }
            ],
            [
                { text: '🗑 پاکسازی / تنظیم مجدد', callback_data: 'cmd_clear_intro' }
            ]
        ]
    }
};

// Categories for Quick Selection
const categoryMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '🍔 خوراکی', callback_data: 'cat_Food' },
                { text: '🚕 حمل و نقل', callback_data: 'cat_Transport' },
            ],
            [
                { text: '🏠 قبوض و اجاره', callback_data: 'cat_Bills' },
                { text: '🛍 خرید', callback_data: 'cat_Shopping' }
            ],
            [
                { text: '🍎 بهداشت و درمان', callback_data: 'cat_Health' },
                {
                    text: '🎮 سرگرمی', callback_data: 'cat_Entertainment'
                },
                [
                    { text: 'سایر موارد', callback_data: 'cat_Others' },
                ],
            ]
        ]
    }
};

module.exports = { mainMenu, categoryMenu };


