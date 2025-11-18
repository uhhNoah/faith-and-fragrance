const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    scent: { type: String, required: true }, // Example scent field
    price: { type: Number, required: true }, // in cents
    image: { type: String, required: true }, // URL to product image
    category: { type: String, required: true },
    stock: { type: Number, default: 0 },
    size: { type: String, default: "8oz" }, // whatever size options you use
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
