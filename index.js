require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const express = require('express');
const Expense = require('./models');

// 1. Setup Express (Required for Liara health checks/keeping alive)
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// 2. Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// 3. Initialize Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log("Bot started...");

// 4. Helper function to parse input
// Accepted formats: "100 Lunch", "50", "200 Taxi"
const parseMessage = (text) => {
  const parts = text.split(' ');
  const amount = parseFloat(parts[0]);
  
  if (isNaN(amount)) return null; // Not a number
  
  const description = parts.slice(1).join(' ') || 'General';
  return { amount, description };
};

// 5. Handle Incoming Messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands starting with / for the general handler
  if (text.startsWith('/')) return;

  const data = parseMessage(text);

  if (data) {
    try {
      await Expense.create({
        chatId: chatId,
        amount: data.amount,
        description: data.description
      });
      bot.sendMessage(chatId, `✅ Saved: ${data.amount} for ${data.description}`);
    } catch (error) {
      bot.sendMessage(chatId, '❌ Error saving expense.');
      console.error(error);
    }
  } else {
    bot.sendMessage(chatId, '⚠️ Please send format: `Amount Description` (e.g., 150 Lunch)');
  }
});

// 6. Command: /report (Get total spending)
bot.onText(/\/report/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Default: Report for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const expenses = await Expense.find({
      chatId: chatId,
      date: { $gte: thirtyDaysAgo }
    });

    if (expenses.length === 0) {
      return bot.sendMessage(chatId, 'No expenses found in the last 30 days.');
    }

    let total = 0;
    let message = '📊 **Last 30 Days Report:**\n\n';

    expenses.forEach(exp => {
      total += exp.amount;
      // Format date to YYYY-MM-DD
      const dateStr = exp.date.toISOString().split('T')[0]; 
      message += `• ${dateStr}: ${exp.amount} (${exp.description})\n`;
    });

    message += `\n💰 **Total: ${total}**`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (error) {
    bot.sendMessage(chatId, '❌ Error generating report.');
    console.error(error);
  }
});

// 7. Command: /today (Get today's spending)
bot.onText(/\/today/, async (msg) => {
    const chatId = msg.chat.id;
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
  
    try {
      const expenses = await Expense.find({
        chatId: chatId,
        date: { $gte: startOfDay }
      });
  
      let total = 0;
      expenses.forEach(e => total += e.amount);
  
      bot.sendMessage(chatId, `📅 **Today's Total:** ${total}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(error);
    }
  });

// 8. Handle Errors
bot.on('polling_error', (error) => {
  console.log(error.code);  // => 'EFATAL'
});
