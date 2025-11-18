const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // ord-xxxx
  items: Array,
  customer: {
    name: String,
    email: String
  },
  paymentStatus: String, // paid, unpaid
  status: String,        // new, processing, shipped, etc.
  totals: {
    totalCents: Number,
    subtotalCents: Number,
    taxCents: Number,
    shippingCents: Number
  },
  shipping: Object,
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);
