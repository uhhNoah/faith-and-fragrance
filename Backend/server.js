const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const connectDB = require("./config/db");

// Init
connectDB();
const app = express();

// Stripe webhook needs raw, everything else JSON
app.use((req, res, next) => {
  if (req.originalUrl.includes("/api/checkout/webhook")) next();
  else express.json()(req, res, next);
});

app.use("/uploads", express.static("uploads"));
app.use(cors({ origin: "*" }));

// Routes
app.use("/api/products", require("./routes/products"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/contact", require("./routes/contact"));

app.use("/api/checkout", require("./routes/checkout"));

// Admin Login FIRST
app.use("/api/admin", require("./routes/adminAuth"));

// Admin protected routes
app.use("/api/admin/products", require("./routes/adminProducts"));
app.use("/api/admin/orders", require("./routes/adminOrders"));
app.use("/api/admin/discounts", require("./routes/adminDiscounts"));
app.use("/api/admin/subscribers", require("./routes/adminSubscribers"));
app.use("/api/admin/abandoned-carts", require("./routes/adminAbandoned"));
app.use("/api/admin/pos-sales", require("./routes/adminPOS"));


// Root test
app.get("/", (req, res) => {
  res.json({ ok: true, service: "Faith & Fragrance Backend" });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
