// Main Menu Dashboard
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '➕ Add Expense', callback_data: 'cmd_add_intro' },
                { text: '💰 Set Budget', callback_data: 'cmd_set_budget' } // <--- NEW BUTTON
            ],
            [
                { text: '📅 Today', callback_data: 'report_today' },
                { text: '🗓 This Month', callback_data: 'report_month' }
            ],
            [
                { text: '📈 Last 10 Items', callback_data: 'report_last10' },
                { text: '📊 Visual Reports', callback_data: 'report_charts' }
            ],
            [
                 { text: '🗑 Reset/Clear', callback_data: 'cmd_clear_intro' }
            ]
        ]
    }
};

// ... (rest of the file remains the same)


// Categories for Quick Selection (Optional fancy feature)
const categoryMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '🍔 Food', callback_data: 'cat_Food' },
                { text: '🚕 Transport', callback_data: 'cat_Transport' },
            ],
            [
                { text: '🏠 Bills', callback_data: 'cat_Bills' },
                { text: '🛍 Shopping', callback_data: 'cat_Shopping' }
            ],
            [
                { text: '🍎 Health & hygiene', callback_data: 'cat_Health' },
                { text: '🎮 Hobbies', callback_data: 'cat_Hobbies' }
            ],
            [
                { text: 'Others', callback_data: 'cat_Others' },
            ],
        ]
    }
};

module.exports = { mainMenu, categoryMenu };