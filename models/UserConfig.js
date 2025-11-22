const mongoose = require('mongoose');

const UserConfigSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  monthlyBudget: { type: Number, default: 0 } // 0 means no limit set
});

module.exports = mongoose.model('UserConfig', UserConfigSchema);
