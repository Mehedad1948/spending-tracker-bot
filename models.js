const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  chatId: { type: Number, required: true }, // To identify the user
  amount: { type: Number, required: true },
  description: { type: String, default: 'No Description' },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Expense', expenseSchema);
