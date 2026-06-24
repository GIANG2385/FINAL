// Generates ~2,000 orders for June 1–30, 2026 (Hanoi, UTC+7)
// Mirrors the schema in pangpang_10k_orders.json
const fs = require('fs');

const TOTAL_ORDERS = 2000;
const START_TIME = new Date('2026-06-01T08:00:00+07:00').getTime();
const END_TIME   = new Date('2026-06-30T23:00:00+07:00').getTime();

const CHANNELS         = ['dine_in', 'dine_in', 'dine_in', 'delivery', 'reservation'];
const PAYMENT_METHODS  = ['cash', 'credit_card', 'qr_code', 'digital_wallet'];
const TABLES           = ['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10','T11','T12'];

const MENU_ITEMS = [
  { sku: 'MENU-PADTHAI',      name_en: 'Pad Thai Shrimp',      name_vi: 'Pad Thai tôm',      price: 95000  },
  { sku: 'MENU-TOMYUM',       name_en: 'Tom Yum Soup',         name_vi: 'Canh Tom Yum',      price: 120000 },
  { sku: 'MENU-MANGORICE',    name_en: 'Mango Sticky Rice',    name_vi: 'Xôi xoài',          price: 65000  },
  { sku: 'MENU-BEEFBASIL',    name_en: 'Basil Beef',           name_vi: 'Bò xào húng quế',   price: 110000 },
  { sku: 'MENU-CHICKENCURRY', name_en: 'Green Curry Chicken',  name_vi: 'Cà ri xanh gà',     price: 105000 },
];

function rInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }

function toBKKISO(ms) {
  return new Date(ms + 7 * 3600000).toISOString().replace('Z', '+07:00');
}

const dataset = [];

for (let i = 1; i <= TOTAL_ORDERS; i++) {
  const channel  = pick(CHANNELS);
  const status   = Math.random() > 0.05 ? 'served' : 'cancelled';
  const ts       = rInt(START_TIME, END_TIME);
  const createdAt = toBKKISO(ts);

  let servedAt = null;
  if (status === 'served') {
    servedAt = toBKKISO(ts + rInt(10, 45) * 60000);
  }

  const numItems = rInt(1, 4);
  const items = [];
  let totalAmount = 0;
  for (let j = 0; j < numItems; j++) {
    const m   = pick(MENU_ITEMS);
    const qty = rInt(1, 3);
    items.push({ sku: m.sku, name_en: m.name_en, name_vi: m.name_vi, qty, unit_price: m.price });
    totalAmount += m.price * qty;
  }

  dataset.push({
    id: `ORD-JUN26-${i}`,
    channel,
    table_id: (channel === 'dine_in' || channel === 'reservation') ? pick(TABLES) : null,
    items,
    status,
    created_at: createdAt,
    served_at: servedAt,
    total_amount: totalAmount,
    payment_method: status === 'served' ? pick(PAYMENT_METHODS) : null,
  });
}

fs.writeFileSync('pangpang_june_orders.json', JSON.stringify(dataset, null, 2), 'utf8');
console.log(`Generated ${dataset.length} orders → pangpang_june_orders.json`);
