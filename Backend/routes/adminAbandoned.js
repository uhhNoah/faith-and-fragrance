const router = require("express").Router();
const Cart = require("../models/Cart");
const authAdmin = require("../middleware/authAdmin");
const sendEmail = require("../utils/email");

// GET ABANDONED CARTS (> 2 hours old)
router.get("/", authAdmin, async (req, res) => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;

  const carts = await Cart.find({
    status: "open",
    createdAt: { $lt: new Date(cutoff) }
  });

  res.json(carts);
});

// SEND NUDGE EMAIL
router.post("/:id/nudge", authAdmin, async (req, res) => {
  const cart = await Cart.findOne({ id: req.params.id });
  if (!cart) return res.status(404).json({ error: "Not found" });

  await sendEmail({
    to: cart.email,
    subject: "We saved your cart",
    text: "Return anytime to complete your order."
  });

  cart.lastNudgedAt = new Date();
  await cart.save();

  res.json({ ok: true });
});

module.exports = router;
