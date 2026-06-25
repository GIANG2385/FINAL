// src/data/menu.js
// SKUs match the Supabase historical orders (MENU-* prefix).
// ingredient_sku references the inventory.sku column for stock decrements.
export const MENU_ITEMS = [
  {
    sku: 'MENU-BEEFBASIL',
    name_en: 'Basil Beef',
    name_vi: 'Bò xào húng quế',
    unit_price: 110000,
    ingredient_sku: 'INV-BEEF-01',
    ingredient_qty: 0.15,
  },
  {
    sku: 'MENU-CHICKENCURRY',
    name_en: 'Green Curry Chicken',
    name_vi: 'Cà ri xanh gà',
    unit_price: 105000,
    ingredient_sku: 'INV-CHK-01',
    ingredient_qty: 0.2,
  },
  {
    sku: 'MENU-TOMYUM',
    name_en: 'Tom Yum Soup',
    name_vi: 'Canh Tom Yum',
    unit_price: 120000,
    ingredient_sku: 'INV-SHRIMP-01',
    ingredient_qty: 0.1,
  },
  {
    sku: 'MENU-PADTHAI',
    name_en: 'Pad Thai Shrimp',
    name_vi: 'Pad Thai tôm',
    unit_price: 95000,
    ingredient_sku: 'INV-SHRIMP-01',
    ingredient_qty: 0.15,
  },
  {
    sku: 'MENU-MANGORICE',
    name_en: 'Mango Sticky Rice',
    name_vi: 'Xôi xoài',
    unit_price: 65000,
    ingredient_sku: 'INV-RICE-01',
    ingredient_qty: 0.15,
  },
]

export function findMenuItem(sku) {
  return MENU_ITEMS.find((m) => m.sku === sku)
}
