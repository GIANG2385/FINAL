// Data Generation Configuration
const fs = require('fs');

const TOTAL_ORDERS = 10000;
const START_TIME = new Date('2026-01-01T08:00:00+07:00').getTime();
const END_TIME = new Date('2026-05-31T23:00:00+07:00').getTime();

// Reference Data
const CHANNELS = ['dine_in', 'delivery', 'reservation'];
const PAYMENT_METHODS = ['cash', 'credit_card', 'qr_code', 'digital_wallet'];
const TABLES = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'];
const STATUSES = ['served', 'cancelled'];

const MENU_ITEMS = [
  { sku: 'MENU-PADTHAI', name_en: 'Pad Thai Shrimp', name_vi: 'Pad Thai tôm', price: 95000 },
  { sku: 'MENU-TOMYUM', name_en: 'Tom Yum Soup', name_vi: 'Canh Tom Yum', price: 120000 },
  { sku: 'MENU-MANGORICE', name_en: 'Mango Sticky Rice', name_vi: 'Xôi xoài', price: 65000 },
  { sku: 'MENU-BEEFBASIL', name_en: 'Basil Beef', name_vi: 'Bò xào húng quế', price: 110000 },
  { sku: 'MENU-CHICKENCURRY', name_en: 'Green Curry Chicken', name_vi: 'Cà ri xanh gà', price: 105000 }
];

// Helper Functions
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function toBangkokISOString(timeMs) {
  // Bangkok (UTC+7) has no DST, so this offset is always exactly 7 hours.
  const bangkokMs = timeMs + 7 * 60 * 60 * 1000;
  return new Date(bangkokMs).toISOString().replace('Z', '+07:00');
}

function generateRandomDate() {
  const randomTime = getRandomInt(START_TIME, END_TIME);
  return toBangkokISOString(randomTime);
}

// Order Generation Process
const dataset = [];

for (let i = 1; i <= TOTAL_ORDERS; i++) {
  const channel = getRandomElement(CHANNELS);
  const status = Math.random() > 0.05 ? 'served' : 'cancelled'; 
  const createdAt = generateRandomDate();
  
  // Calculate served time if not cancelled
  let servedAt = null;
  if (status === 'served') {
    const createdDate = new Date(createdAt);
    const prepTimeMinutes = getRandomInt(10, 45);
    servedAt = toBangkokISOString(createdDate.getTime() + prepTimeMinutes * 60000);
  }

  // Generate random order items
  const numItems = getRandomInt(1, 4);
  const items = [];
  let totalAmount = 0;

  for (let j = 0; j < numItems; j++) {
    const menuItem = getRandomElement(MENU_ITEMS);
    const qty = getRandomInt(1, 3);
    items.push({
      sku: menuItem.sku,
      name_en: menuItem.name_en,
      name_vi: menuItem.name_vi,
      qty: qty,
      unit_price: menuItem.price
    });
    totalAmount += (menuItem.price * qty);
  }

  // Construct the order object
  const order = {
    id: `ORD-BULK-${3000 + i}`,
    channel: channel,
    table_id: channel === 'dine_in' || channel === 'reservation' ? getRandomElement(TABLES) : null,
    items: items,
    status: status,
    created_at: createdAt,
    served_at: servedAt,
    total_amount: totalAmount,
    payment_method: status === 'served' ? getRandomElement(PAYMENT_METHODS) : null
  };

  dataset.push(order);
}

// File Output
fs.writeFileSync('pangpang_10k_orders.json', JSON.stringify(dataset, null, 2), 'utf8');
console.log('Dataset generated successfully: pangpang_10k_orders.json');