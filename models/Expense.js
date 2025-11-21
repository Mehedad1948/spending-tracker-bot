const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  amount: { type: Number, required: true },
  description: { type: String, default: 'General' },
  category: { type: String, default: 'Uncategorized' }, // New Feature
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Expense', expenseSchema);
