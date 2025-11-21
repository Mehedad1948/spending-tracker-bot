require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const initBot = require('./bot/handlers');

// 1. Connect to Database
connectDB();

// 2. Start Express (For Liara)
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'online', platform: 'Liara' });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

// 3. Initialize Bot Logic
initBot();
