// Main Menu Dashboard
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '➕ Add Expense', callback_data: 'cmd_add_intro' }
      ],
      [
        { text: '📅 Today', callback_data: 'report_today' },
        { text: '🗓 This Month', callback_data: 'report_month' }
      ],
      [
        { text: '📈 Last 10 Items', callback_data: 'report_last10' },
        { text: '🗑 Reset/Clear', callback_data: 'cmd_clear_intro' }
      ]
    ]
  }
};

// Categories for Quick Selection (Optional fancy feature)
const categoryMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🍔 Food', callback_data: 'cat_Food' },
        { text: '🚕 Transport', callback_data: 'cat_Transport' }
      ],
      [
        { text: '🏠 Bills', callback_data: 'cat_Bills' },
        { text: '🛍 Shopping', callback_data: 'cat_Shopping' }
      ]
    ]
  }
};

module.exports = { mainMenu, categoryMenu };
