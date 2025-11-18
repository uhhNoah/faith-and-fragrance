const router = require("express").Router();
const Subscriber = require("../models/Subscriber");
const authAdmin = require("../middleware/authAdmin");

// GET ALL SUBSCRIBERS
router.get("/", authAdmin, async (req, res) => {
  const list = await Subscriber.find().sort({ joinedAt: -1 });
  res.json(list);
});

module.exports = router;
