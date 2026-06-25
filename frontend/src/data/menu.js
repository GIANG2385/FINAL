// Must mirror backend/src/data/menu.js (sku + price) for the POS-lite picker.
// recipes: list of { ingredient_sku, qty } consumed per 1 serving.
export const MENU_ITEMS = [
  {
    sku: 'M-PAD-THAI', name_en: 'Pad Thai', name_vi: 'Pad Thái', unit_price: 95000,
    recipes: [
      { ingredient_sku: 'TH-SHRIMP-01', qty: 0.15 },
      { ingredient_sku: 'TH-RICE-01',   qty: 0.1  },
    ],
  },
  {
    sku: 'M-GREEN-CURRY', name_en: 'Green Curry', name_vi: 'Cà ri xanh', unit_price: 120000,
    recipes: [
      { ingredient_sku: 'TH-CHK-01',  qty: 0.2  },
      { ingredient_sku: 'TH-COCO-01', qty: 0.15 },
    ],
  },
  {
    sku: 'M-TOM-YUM', name_en: 'Tom Yum Soup', name_vi: 'Súp Tom Yum', unit_price: 85000,
    recipes: [
      { ingredient_sku: 'TH-SHRIMP-01', qty: 0.1 },
    ],
  },
  {
    sku: 'M-MANGO-STICKY', name_en: 'Mango Sticky Rice', name_vi: 'Xôi xoài', unit_price: 60000,
    recipes: [
      { ingredient_sku: 'TH-RICE-01', qty: 0.15 },
    ],
  },
  {
    sku: 'M-SPRING-ROLL', name_en: 'Spring Rolls', name_vi: 'Chả giò', unit_price: 50000,
    recipes: [
      { ingredient_sku: 'TH-BASIL-01', qty: 0.05 },
    ],
  },
]
