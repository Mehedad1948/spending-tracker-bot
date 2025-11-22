const QuickChart = require('quickchart-js');

// Helper: Generate a random color palette
const getColors = (count) => {
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
        '#E7E9ED', '#71B37C', '#EC932F', '#e67e22', '#2ecc71', '#f1c40f'
    ];
    return colors.slice(0, count);
};

/**
 * 1. PIE CHART: Expense by Category
 */
const generateCategoryPie = async (expenses) => {
    // Aggregate data
    const categoryMap = {};
    expenses.forEach(e => {
        categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
    });

    const labels = Object.keys(categoryMap);
    const data = Object.values(categoryMap);

    if (labels.length === 0) return null;

    const chart = new QuickChart();
    chart.setConfig({
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Expenses',
                data: data,
                backgroundColor: getColors(labels.length)
            }]
        },
        options: {
            title: { display: true, text: 'Expenses by Category' },
            plugins: {
                datalabels: { display: true, color: 'white' } // Show values on slices
            }
        }
    });
    
    // Make image clearer
    chart.setWidth(500);
    chart.setHeight(300);
    chart.setBackgroundColor('white');

    return await chart.toBinary(); // Returns image buffer
};

/**
 * 2. BAR CHART: Daily Spending (Last 30 Days)
 */
const generateDailyBar = async (expenses) => {
    // Aggregate data by Day (YYYY-MM-DD)
    const dayMap = {};
    
    // Sort expenses by date first
    expenses.sort((a, b) => a.date - b.date);

    expenses.forEach(e => {
        const dateStr = e.date.toISOString().split('T')[0]; // YYYY-MM-DD
        dayMap[dateStr] = (dayMap[dateStr] || 0) + e.amount;
    });

    const labels = Object.keys(dayMap); // Days
    const data = Object.values(dayMap); // Amounts

    if (labels.length === 0) return null;

    const chart = new QuickChart();
    chart.setConfig({
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Spending',
                data: data,
                backgroundColor: '#36A2EB'
            }]
        },
        options: {
            title: { display: true, text: 'Daily Spending Trend' },
            scales: {
                yAxes: [{
                    ticks: { beginAtZero: true }
                }]
            }
        }
    });

    chart.setWidth(600);
    chart.setHeight(400);
    chart.setBackgroundColor('white');

    return await chart.toBinary();
};

module.exports = { generateCategoryPie, generateDailyBar };
