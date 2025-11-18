const router = require("express").Router();
const { adminToken } = require("../utils/tokens");

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ token: adminToken() });
});

module.exports = router;
