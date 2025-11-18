const mongoose = require("mongoose");

const SubscriberSchema = new mongoose.Schema({
  email: String,
  joinedAt: Date,
  source: String
}, { timestamps: true });

module.exports = mongoose.model("Subscriber", SubscriberSchema);
