const router = require("express").Router();
const Product = require("../models/Product");

// GET ACTIVE PRODUCTS PUBLIC
router.get("/", async (req, res) => {
  try {
    const list = await Product.find({ active: true });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Failed to load products" });
  }
});

// Public single product (optional)
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findOne({ id: req.params.id, active: true });
    if (!product) return res.status(404).json({ error: "Not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to load product" });
  }
});

module.exports = router;
