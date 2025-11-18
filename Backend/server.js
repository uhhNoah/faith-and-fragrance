// Backend/server.js
// Faith & Fragrance Co. – lightweight JSON + file based backend

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const app = express();

// ----- ENV + CONSTANTS -----
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-admin-jwt-secret";

// Hard-coded admin for now (can move to env later)
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "admin@faith-and-fragrance-co.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

const DATA_DIR = __dirname;
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// Seed products if products.json is empty or missing
const defaultSeedProducts = [
  {
    id: "jelly-01",
    name: "Mercy Morning Jelly Melt",
    description:
      "Soft vanilla, clean linen, and a quiet hint of cedar. Made to feel like new mercies and fresh sheets.",
    priceCents: 1299,
    collection: "jelly-melts",
    imageUrl: "",
    active: true,
  },
  {
    id: "jelly-02",
    name: "Grace After Dark Jelly Melt",
    description:
      "Smoked amber, sandalwood, and a trace of tonka. For late nights, answered prayers, and deep exhale moments.",
    priceCents: 1299,
    collection: "jelly-melts",
    imageUrl: "",
    active: true,
  },
  {
    id: "classic-01",
    name: "Still Waters Wax Melt",
    description:
      "Lavender, bergamot, and driftwood. A gentle, steadying fragrance for restless rooms.",
    priceCents: 1099,
    collection: "classic-wax-melts",
    imageUrl: "",
    active: true,
  },
  {
    id: "candle-01",
    name: "Altar Light Candle",
    description:
      "Warm fig, honey, and smoke from an old church candle. Poured for quiet evenings and gratitude lists.",
    priceCents: 2499,
    collection: "candles",
    imageUrl: "",
    active: true,
  },
];

// ----- HELPERS: JSON I/O -----
function safeReadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error(`Failed to read JSON from ${filePath}:`, err);
    return fallback;
  }
}

function safeWriteJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`Failed to write JSON to ${filePath}:`, err);
  }
}

// ----- PRODUCTS HELPERS -----
function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
    return defaultSeedProducts.map((p) => ({ ...p }));
  }

  return rawProducts.map((p) => {
    const idBase =
      p.id ||
      p.sku ||
      `prod-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let priceCents = 0;
    if (typeof p.priceCents === "number") {
      priceCents = Math.max(0, Math.round(p.priceCents));
    } else if (typeof p.price === "number") {
      priceCents = Math.max(0, Math.round(p.price * 100));
    } else if (typeof p.price === "string") {
      const parsed = parseFloat(p.price);
      if (!isNaN(parsed)) priceCents = Math.max(0, Math.round(parsed * 100));
    }

    const collection = (p.collection || "").toString().trim().toLowerCase();

    return {
      id: String(idBase),
      name: String(p.name || "").trim(),
      description: String(p.description || "").trim(),
      priceCents,
      collection,
      imageUrl: p.imageUrl || "",
      active: p.active !== false,
    };
  });
}

function loadProducts() {
  const raw = safeReadJSON(PRODUCTS_FILE, null);

  if (!raw) {
    const seeded = normalizeProducts(defaultSeedProducts);
    safeWriteJSON(PRODUCTS_FILE, seeded);
    return seeded;
  }

  const normalized = normalizeProducts(raw);
  // ensure file is normalized too
  safeWriteJSON(PRODUCTS_FILE, normalized);
  return normalized;
}

function saveProducts(products) {
  safeWriteJSON(PRODUCTS_FILE, products);
}

function loadSubscribers() {
  const raw = safeReadJSON(SUBSCRIBERS_FILE, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    id:
      s.id ||
      `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: String(s.email || "").toLowerCase().trim(),
    createdAt: s.createdAt || s.joinedAt || new Date().toISOString(),
    source: s.source || "unknown",
  }));
}

function saveSubscribers(subscribers) {
  safeWriteJSON(SUBSCRIBERS_FILE, subscribers);
}

function loadOrders() {
  const raw = safeReadJSON(ORDERS_FILE, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => ({
    id: o.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    items: Array.isArray(o.items) ? o.items : [],
    customer: o.customer || {},
    totals: o.totals || {},
    status: o.status || "pending",
    createdAt: o.createdAt || new Date().toISOString(),
  }));
}

function saveOrders(orders) {
  safeWriteJSON(ORDERS_FILE, orders);
}

// ----- FILE UPLOAD (PRODUCT IMAGES) -----
const uploadsDir = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "");
    const base =
      path.basename(file.originalname || "image", ext).replace(/[^a-z0-9]+/gi, "-") ||
      "image";
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// ----- MIDDLEWARE -----
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// Simple health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ----- AUTH HELPERS -----
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });
}

function authAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    return next();
  } catch (err) {
    console.error("JWT error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// ----- ADMIN AUTH ROUTES -----
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = (email || "").toLowerCase().trim();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (normalizedEmail !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const token = generateToken({
    sub: "admin",
    email: ADMIN_EMAIL,
  });

  return res.json({ token });
});

app.get("/api/admin/me", authAdmin, (req, res) => {
  res.json({
    email: ADMIN_EMAIL,
    role: "admin",
  });
});

// ----- PRODUCTS (PUBLIC) -----
app.get("/api/products", (req, res) => {
  const products = loadProducts();
  const activeOnly = products.filter((p) => p.active !== false);
  res.json(activeOnly);
});

app.get("/api/products/:id", (req, res) => {
  const products = loadProducts();
  const product = products.find((p) => p.id === req.params.id);
  if (!product || product.active === false) {
    return res.status(404).json({ error: "Product not found." });
  }
  res.json(product);
});

// ----- ADMIN PRODUCTS -----
app.get("/api/admin/products", authAdmin, (req, res) => {
  const products = loadProducts();
  res.json(products);
});

app.post("/api/admin/products", authAdmin, (req, res) => {
  const { name, description, priceCents, collection } = req.body || {};

  if (!name || typeof priceCents !== "number") {
    return res.status(400).json({ error: "Name and priceCents are required." });
  }

  const products = loadProducts();

  const id = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newProduct = {
    id,
    name: String(name).trim(),
    description: String(description || "").trim(),
    priceCents: Math.max(0, Math.round(priceCents)),
    collection: (collection || "").toString().trim().toLowerCase(),
    imageUrl: "",
    active: true,
  };

  products.push(newProduct);
  saveProducts(products);

  res.status(201).json(newProduct);
});

app.put("/api/admin/products/:id", authAdmin, (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};

  const products = loadProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Product not found." });
  }

  const current = products[index];

  let priceCents = current.priceCents;
  if (typeof updates.priceCents === "number") {
    priceCents = Math.max(0, Math.round(updates.priceCents));
  }

  products[index] = {
    ...current,
    name: updates.name !== undefined ? String(updates.name).trim() : current.name,
    description:
      updates.description !== undefined
        ? String(updates.description).trim()
        : current.description,
    priceCents,
    collection:
      updates.collection !== undefined
        ? String(updates.collection).trim().toLowerCase()
        : current.collection,
    active:
      typeof updates.active === "boolean" ? updates.active : current.active,
  };

  saveProducts(products);
  res.json(products[index]);
});

app.delete("/api/admin/products/:id", authAdmin, (req, res) => {
  const { id } = req.params;
  const products = loadProducts();
  const index = products.findIndex((p) => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Product not found." });
  }

  const removed = products.splice(index, 1)[0];
  saveProducts(products);

  res.json({ ok: true, removed });
});

app.post(
  "/api/admin/products/:id/image",
  authAdmin,
  upload.single("image"),
  (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded." });
    }

    const products = loadProducts();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found." });
    }

    const publicUrl = `/uploads/${req.file.filename}`;
    products[index].imageUrl = publicUrl;
    saveProducts(products);

    res.json({ ok: true, imageUrl: publicUrl, product: products[index] });
  }
);

// ----- SUBSCRIBERS (PUBLIC SIGNUP) -----
app.post("/api/subscribe", (req, res) => {
  const { email, source } = req.body || {};
  const normalizedEmail = (email || "").toLowerCase().trim();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ error: "Valid email is required." });
  }

  let subscribers = loadSubscribers();

  if (subscribers.some((s) => s.email === normalizedEmail)) {
    return res.json({ ok: true, message: "Already subscribed." });
  }

  const newSubscriber = {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: normalizedEmail,
    createdAt: new Date().toISOString(),
    source: source || "site",
  };

  subscribers.push(newSubscriber);
  saveSubscribers(subscribers);

  res.status(201).json({ ok: true, subscriber: newSubscriber });
});

// ----- ADMIN SUBSCRIBERS -----
app.get("/api/admin/subscribers", authAdmin, (req, res) => {
  const subscribers = loadSubscribers();

  const sorted = subscribers.slice().sort((a, b) => {
    const aDate = new Date(a.createdAt || a.joinedAt || 0).getTime();
    const bDate = new Date(b.createdAt || b.joinedAt || 0).getTime();
    return bDate - aDate;
  });

  res.json(sorted);
});

// ----- ORDERS (PUBLIC – FROM CHECKOUT) -----
function getSafeCartItem(products, item) {
  const product = products.find((p) => p.id === item.productId);
  if (!product || product.active === false) return null;

  const qty = Number.isFinite(item.quantity) ? Math.max(1, item.quantity) : 1;

  return {
    productId: product.id,
    name: product.name,
    priceCents: product.priceCents,
    quantity: qty,
    lineTotalCents: product.priceCents * qty,
  };
}

app.post("/api/orders", (req, res) => {
  const { items, customer, totals } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Order items are required." });
  }

  const products = loadProducts();

  const safeItems = items
    .map((item) => getSafeCartItem(products, item))
    .filter(Boolean);

  if (safeItems.length === 0) {
    return res.status(400).json({ error: "Invalid order items." });
  }

  const computedSubtotal = safeItems.reduce(
    (sum, i) => sum + i.lineTotalCents,
    0
  );

  let shippingCents = 0;
  let taxCents = 0;

  if (totals && typeof totals.shippingCents === "number") {
    shippingCents = Math.max(0, Math.round(totals.shippingCents));
  }
  if (totals && typeof totals.taxCents === "number") {
    taxCents = Math.max(0, Math.round(totals.taxCents));
  }

  const totalCents = computedSubtotal + shippingCents + taxCents;

  const safeCustomer = {
    name: (customer && customer.name ? String(customer.name) : "").trim(),
    email:
      (customer && customer.email
        ? String(customer.email).toLowerCase().trim()
        : ""),
    address: customer && customer.address ? customer.address : {},
    notes: customer && customer.notes ? String(customer.notes).trim() : "",
  };

  const orders = loadOrders();

  const newOrder = {
    id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    items: safeItems,
    customer: safeCustomer,
    totals: {
      subtotalCents: computedSubtotal,
      shippingCents,
      taxCents,
      totalCents,
    },
    status: "pending", // admin view can later change this
    createdAt: new Date().toISOString(),
  };

  orders.push(newOrder);
  saveOrders(orders);

  res.status(201).json({ ok: true, order: newOrder });
});

// ----- ADMIN ORDERS (READ-ONLY FOR NOW) -----
app.get("/api/admin/orders", authAdmin, (req, res) => {
  const search = (req.query.search || "").toString().toLowerCase().trim();
  const orders = loadOrders();

  let filtered = orders.slice();

  if (search) {
    filtered = filtered.filter((order) => {
      if (order.id && order.id.toLowerCase().includes(search)) return true;

      const name =
        order.customer && order.customer.name
          ? order.customer.name.toLowerCase()
          : "";
      const email =
        order.customer && order.customer.email
          ? order.customer.email.toLowerCase()
          : "";

      if (name.includes(search) || email.includes(search)) return true;

      const notes =
        order.customer && order.customer.notes
          ? order.customer.notes.toLowerCase()
          : "";
      if (notes.includes(search)) return true;

      return false;
    });
  }

  filtered.sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime()
  );

  res.json(filtered);
});

// (You can add a PATCH route later for clickable status changes if you want)

// ----- BOOT -----
app.listen(PORT, () => {
  console.log(`Faith & Fragrance backend listening on http://localhost:${PORT}`);
  console.log("Admin email:", ADMIN_EMAIL);
});