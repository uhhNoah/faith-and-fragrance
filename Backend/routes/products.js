const router = require("express").Router();
const Product = require("../models/Product");

// GET all active products (public)
router.get("/", async (req, res) => {
  try {
    const list = await Product.find({ active: true });
    res.json(list);
  } catch (err) {
    console.error("PRODUCT GET ERROR:", err);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// Optional single product endpoint
router.get("/:id", async (req, res) => {
  try {
    const item = await Product.findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: "Failed to load product" });
  }
});

module.exports = router;
