const router = require("express").Router();
const bcrypt = require("bcryptjs");
const Customer = require("../models/Customer");
const { customerToken } = require("../utils/tokens");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await Customer.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);

    const customer = await Customer.create({
      id: "cus-" + Date.now(),
      name,
      email: email.toLowerCase(),
      passwordHash: hash,
    });

    res.json({
      token: customerToken(customer),
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to register" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) return res.status(401).json({ error: "Invalid login" });

    const match = await bcrypt.compare(password, customer.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid login" });

    res.json({
      token: customerToken(customer),
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to login" });
  }
});

module.exports = router;
