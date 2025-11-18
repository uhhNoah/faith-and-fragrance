const router = require("express").Router();
const PosSale = require("../models/PosSale");
const Product = require("../models/Product");
const authAdmin = require("../middleware/authAdmin");

// MANUAL POS TAX RATE
const MANUAL_TAX_RATE = Number(process.env.TAX_RATE || 0);

router.post("/sale", authAdmin, async (req, res) => {
  const { items, paymentMethod } = req.body;

  const safeItems = [];

  for (const i of items) {
    const p = await Product.findOne({ id: i.id });
    if (!p) continue;

    safeItems.push({
      productId: p.id,
      name: p.name,
      priceCents: p.priceCents,
      quantity: i.qty
    });
  }

  if (!safeItems.length)
    return res.status(400).json({ error: "Invalid sale" });

  const subtotal = safeItems.reduce(
    (sum, i) => sum + i.priceCents * i.quantity,
    0
  );
  const tax = Math.round(subtotal * MANUAL_TAX_RATE);
  const total = subtotal + tax;

  const sale = await PosSale.create({
    id: "pos-" + Date.now(),
    items: safeItems,
    totals: {
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
    },
    paymentMethod
  });

  res.json(sale);
});

// GET POS SALES
router.get("/", authAdmin, async (req, res) => {
  const sales = await PosSale.find().sort({ createdAt: -1 });
  res.json(sales);
});

module.exports = router;
