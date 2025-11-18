const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // cus-xxxx
  name: String,
  email: { type: String, unique: true },
  passwordHash: String
}, { timestamps: true });

module.exports = mongoose.model("Customer", CustomerSchema);
