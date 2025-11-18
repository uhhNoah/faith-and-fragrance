const router = require("express").Router();
const authAdmin = require("../middleware/authAdmin");
const Order = require("../models/Order");

// GET ALL ORDERS
router.get("/", authAdmin, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});

// UPDATE ORDER
router.put("/:id", authAdmin, async (req, res) => {
  const updated = await Order.findOneAndUpdate(
    { id: req.params.id },
    req.body,
    { new: true }
  );

  if (!updated) return res.status(404).json({ error: "Not found" });

  res.json(updated);
});

module.exports = router;
