const mongoose = require("mongoose");

const PosSaleSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  items: Array,
  totals: Object,
  paymentMethod: String
}, { timestamps: true });

module.exports = mongoose.model("PosSale", PosSaleSchema);
