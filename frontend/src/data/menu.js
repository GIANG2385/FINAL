// Must mirror Supabase menu_items table (sku + price).
// recipes: list of { ingredient_sku, qty } consumed per 1 serving.
// Prices calibrated for busy scenario: ~16.2M VND/day (22 orders × avg 735K)
export const MENU_ITEMS = [
  {
    sku: 'MENU-BEEFBASIL', name_en: 'Basil Beef', name_vi: 'Bò xào húng quế', unit_price: 195000,
    recipes: [
      { ingredient_sku: 'INV-BEEF-01',  ingredient_name_en: 'Beef Sirloin',  ingredient_name_vi: 'Thịt bò', qty: 0.2,  unit: 'kg' },
      { ingredient_sku: 'INV-BASIL-01', ingredient_name_en: 'Thai Basil',    ingredient_name_vi: 'Húng quế', qty: 0.05, unit: 'kg' },
    ],
  },
  {
    sku: 'MENU-CHICKENCURRY', name_en: 'Chicken Curry', name_vi: 'Cà ri gà', unit_price: 185000,
    recipes: [
      { ingredient_sku: 'INV-CHK-01',   ingredient_name_en: 'Chicken Thigh', ingredient_name_vi: 'Đùi gà',      qty: 0.25, unit: 'kg' },
      { ingredient_sku: 'INV-COCO-01',  ingredient_name_en: 'Coconut Milk',  ingredient_name_vi: 'Nước cốt dừa', qty: 0.15, unit: 'L'  },
    ],
  },
  {
    sku: 'MENU-TOMYUM', name_en: 'Tom Yum Soup', name_vi: 'Súp Tom Yum', unit_price: 165000,
    recipes: [
      { ingredient_sku: 'INV-SHRIMP-01', ingredient_name_en: 'Shrimp',      ingredient_name_vi: 'Tôm',        qty: 0.15, unit: 'kg' },
      { ingredient_sku: 'INV-BASIL-01',  ingredient_name_en: 'Thai Basil',  ingredient_name_vi: 'Húng quế',   qty: 0.03, unit: 'kg' },
    ],
  },
  {
    sku: 'MENU-PADTHAI', name_en: 'Pad Thai', name_vi: 'Pad Thái', unit_price: 155000,
    recipes: [
      { ingredient_sku: 'INV-SHRIMP-01',  ingredient_name_en: 'Shrimp',        ingredient_name_vi: 'Tôm',     qty: 0.12, unit: 'kg' },
      { ingredient_sku: 'INV-NOODLE-01',  ingredient_name_en: 'Rice Noodles',  ingredient_name_vi: 'Bún gạo', qty: 0.1,  unit: 'kg' },
    ],
  },
  {
    sku: 'MENU-MANGORICE', name_en: 'Mango Sticky Rice', name_vi: 'Xôi xoài', unit_price: 95000,
    recipes: [
      { ingredient_sku: 'INV-RICE-01',  ingredient_name_en: 'Jasmine Rice', ingredient_name_vi: 'Gạo jasmine', qty: 0.15, unit: 'kg' },
      { ingredient_sku: 'INV-MANGO-01', ingredient_name_en: 'Mango',        ingredient_name_vi: 'Xoài',        qty: 0.2,  unit: 'kg' },
    ],
  },
]
