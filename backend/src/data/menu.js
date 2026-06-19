// MVP menu — mirrors the items used by backend/src/scripts/seed.js.
// Each menu item consumes one inventory ingredient, so order creation can
// decrement real stock (see §11 acceptance checklist).
export const MENU_ITEMS = [
  { sku: 'M-PAD-THAI', name_en: 'Pad Thai', name_vi: 'Pad Thái', unit_price: 95000, ingredient_sku: 'TH-SHRIMP-01', ingredient_qty: 0.15 },
  { sku: 'M-GREEN-CURRY', name_en: 'Green Curry', name_vi: 'Cà ri xanh', unit_price: 120000, ingredient_sku: 'TH-CHK-01', ingredient_qty: 0.2 },
  { sku: 'M-TOM-YUM', name_en: 'Tom Yum Soup', name_vi: 'Súp Tom Yum', unit_price: 85000, ingredient_sku: 'TH-SHRIMP-01', ingredient_qty: 0.1 },
  { sku: 'M-MANGO-STICKY', name_en: 'Mango Sticky Rice', name_vi: 'Xôi xoài', unit_price: 60000, ingredient_sku: 'TH-RICE-01', ingredient_qty: 0.15 },
  { sku: 'M-SPRING-ROLL', name_en: 'Spring Rolls', name_vi: 'Chả giò', unit_price: 50000, ingredient_sku: 'TH-BASIL-01', ingredient_qty: 0.05 },
]

export function findMenuItem(sku) {
  return MENU_ITEMS.find((m) => m.sku === sku)
}
