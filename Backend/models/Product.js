const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // prod-xxxx
  name: String,
  description: String,
  priceCents: Number,
  collection: String,
  imageUrl: String,
  active: { type: Boolean, default: true },
  stock: { type: Number, default: null },
  trackInventory: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Product", ProductSchema);
