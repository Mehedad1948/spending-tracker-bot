const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US').format(amount);
};

const formatDate = (date) => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

module.exports = { formatCurrency, formatDate };
