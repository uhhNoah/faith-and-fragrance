const router = require("express").Router();
const Discount = require("../models/Discount");
const authAdmin = require("../middleware/authAdmin");

// GET ALL DISCOUNTS
router.get("/", authAdmin, async (req, res) => {
  const list = await Discount.find();
  res.json(list);
});

// CREATE DISCOUNT
router.post("/", authAdmin, async (req, res) => {
  const { code, type, amount } = req.body;
  
  const exists = await Discount.findOne({ code: code.toUpperCase() });
  if (exists) return res.status(409).json({ error: "Exists" });

  const d = await Discount.create({
    id: code.toUpperCase(),
    code: code.toUpperCase(),
    type,
    amount,
    active: true,
    uses: 0
  });

  res.json(d);
});

// DELETE DISCOUNT
router.delete("/:id", authAdmin, async (req, res) => {
  await Discount.deleteOne({ id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
