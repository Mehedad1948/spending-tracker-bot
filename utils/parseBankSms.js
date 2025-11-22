export const parseBankSms = (text) => {
  // 1. Filter: Only process if it contains "Withdrawal" keywords
  // (Bardasht, Kharid, Pardakht, Enteghal, Debit)
  const withdrawalKeywords = /برداشت|خرید|پرداخت|انتقال|Debit|Withdrawal/i;
  if (!withdrawalKeywords.test(text)) return null;

  // 2. Regex to find the Amount
  // Strategy A: Look for "Mablagh: 100,000" (مبلغ: ۱۰۰,۰۰۰)
  // Strategy B: Look for "100,000 Rial" (۱۰۰,۰۰۰ ریال)
  const amountRegex = /(?:مبلغ|Amount)[:\s]*([0-9,]+)|([0-9,]+)\s*(?:ریال|Rial)/i;
  const match = text.match(amountRegex);

  if (match) {
    // match[1] is Strategy A, match[2] is Strategy B
    const rawValue = match[1] || match[2];
    
    // Remove commas (e.g. "50,000" -> "50000")
    const cleanValue = rawValue.replace(/,/g, '');
    const amount = parseFloat(cleanValue);

    // Optional: If your SMS is in Rials but you track in Tomans, divide by 10 here.
    // return amount / 10; 
    return amount; 
  }
  
  return null;
};
