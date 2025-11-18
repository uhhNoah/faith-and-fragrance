const mongoose = require("mongoose");

const CartSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  email: String,
  items: Array,
  status: String, // open / closed
  createdAt: Date,
  lastNudgedAt: Date
}, { timestamps: true });

module.exports = mongoose.model("Cart", CartSchema);
