const mongoose = require("mongoose");

const DiscountSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // CODE
  code: String,
  type: String,   // percent | fixed
  amount: Number, // percent OR cents
  active: Boolean,
  uses: Number
}, { timestamps: true });

module.exports = mongoose.model("Discount", DiscountSchema);
