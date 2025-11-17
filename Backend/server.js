// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// ===== SIMPLE ADMIN CONFIG =====
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "admin@faith-and-fragrance-co.com";
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "ChangeThisPassword123!"; // CHANGE THIS
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SECRET";

// ===== FILE PATHS =====
const DATA_DIR = __dirname;
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ===== MULTER (IMAGE UPLOAD) =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, req.params.id + ext.toLowerCase());
  },
});
const upload = multer({ storage });

// ===== DEFAULT PRODUCTS (SEED) =====
const defaultSeedProducts = [
  {
    id: "jelly-01",
    name: "Mercy Morning Jelly Melt",
    description:
      "Soft vanilla, clean linen, and a hint of cedar in a jelly texture.",
    priceCents: 1299,
    collection: "jelly-melts",
    active: true,
  },
  {
    id: "jelly-02",
    name: "Quiet Room Jelly Melt",
    description:
      "Subtle musk and warm amber for a calm, grounded space — not overpowering.",
    priceCents: 1299,
    collection: "jelly-melts",
    active: true,
  },
  {
    id: "wax-01",
    name: "Lobby Calm Wax Melt",
    description:
      "That “hotel lobby” vibe — fresh, upscale, and not too loud.",
    priceCents: 999,
    collection: "wax-melts",
    active: true,
  },
  {
    id: "candle-01",
    name: "Evening Mercy Candle",
    description:
      "Slow-burning vanilla + sandalwood for late-night wind-downs.",
    priceCents: 1899,
    collection: "candles",
    active: true,
  },
];

// ===== PRODUCT HELPERS =====
function normalizeProducts(list) {
  return list.map((p) => ({
    ...p,
    active: p.active !== false,
  }));
}

function loadProducts() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) {
      fs.writeFileSync(
        PRODUCTS_FILE,
        JSON.stringify(defaultSeedProducts, null, 2),
        "utf8"
      );
      return normalizeProducts([...defaultSeedProducts]);
    }

    const raw = fs.readFileSync(PRODUCTS_FILE, "utf8");
    if (!raw.trim()) return normalizeProducts([...defaultSeedProducts]);

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return normalizeProducts([...defaultSeedProducts]);

    return normalizeProducts(parsed);
  } catch (err) {
    console.error("Error reading products file:", err);
    return normalizeProducts([...defaultSeedProducts]);
  }
}

function saveProducts(list) {
  try {
    const normalized = normalizeProducts(list);
    fs.writeFileSync(
      PRODUCTS_FILE,
      JSON.stringify(normalized, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("Error writing products file:", err);
  }
}

let products = loadProducts();

// ===== SUBSCRIBERS =====
function loadSubscribers() {
  try {
    if (!fs.existsSync(SUBSCRIBERS_FILE)) {
      fs.writeFileSync(SUBSCRIBERS_FILE, "[]", "utf8");
      return [];
    }
    const raw = fs.readFileSync(SUBSCRIBERS_FILE, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Error reading subscribers file:", err);
    return [];
  }
}

function saveSubscribers(list) {
  try {
    fs.writeFileSync(
      SUBSCRIBERS_FILE,
      JSON.stringify(list, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("Error writing subscribers file:", err);
  }
}

// ===== ORDERS =====
function loadOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) {
      fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
      return [];
    }
    const raw = fs.readFileSync(ORDERS_FILE, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Error reading orders file:", err);
    return [];
  }
}

function saveOrders(list) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing orders file:", err);
  }
}

let orders = loadOrders();

// ===== AUTH =====
function generateAdminToken() {
  return jwt.sign(
    {
      role: "admin",
      email: ADMIN_EMAIL,
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function authAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header." });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ error: "Forbidden." });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// ===== FIXED CORS =====
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",

  // Netlify preview deploys
  /\.netlify\.app$/,

  // 🔥 Correct production domains
  "https://faith-and-fragrance-co.com",
  "https://www.faith-and-fragrance-co.com",
  "https://faithandfragrance.netlify.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (/\.netlify\.app$/.test(origin)) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      console.warn("Blocked CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

// ===== ADMIN LOGIN =====
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required." });
  }

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const token = generateAdminToken();
  return res.json({ token });
});

// Admin identity check
app.get("/api/admin/me", authAdmin, (req, res) => {
  return res.json({
    email: ADMIN_EMAIL,
    role: "admin",
  });
});

// ===== PUBLIC PRODUCTS =====
app.get("/api/products", (req, res) => {
  const visible = products.filter((p) => p.active !== false);
  res.json(visible);
});

// ===== SUBSCRIBE =====
app.post("/api/subscribe", (req, res) => {
  const { email } = req.body || {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Valid email is required." });
  }

  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return res.status(400).json({ error: "Email is required." });
  }

  const subscribers = loadSubscribers();
  const exists = subscribers.some((s) => s.email === trimmed);
  if (exists) {
    return res.status(200).json({ message: "Already subscribed." });
  }

  const newSubscriber = {
    id: `sub-${Date.now()}`,
    email: trimmed,
    createdAt: new Date().toISOString(),
  };

  subscribers.push(newSubscriber);
  saveSubscribers(subscribers);

  console.log("New subscriber:", newSubscriber);

  return res.status(201).json({ message: "Subscribed successfully." });
});

// ===== PUBLIC ORDERS (CHECKOUT) =====
app.post("/api/orders", (req, res) => {
  const { items, customer, totals } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Order must include at least one item." });
  }

  const safeItems = items
    .map((item) => {
      const qty = parseInt(item.quantity, 10);
      const price = parseInt(item.priceCents, 10);

      if (!item.productId || Number.isNaN(qty) || qty <= 0 || Number.isNaN(price) || price < 0) {
        return null;
      }

      return {
        productId: String(item.productId),
        name: String(item.name || ""),
        quantity: qty,
        priceCents: price,
      };
    })
    .filter(Boolean);

  if (!safeItems.length) {
    return res.status(400).json({ error: "Invalid order items." });
  }

  const name = customer?.name?.trim();
  const email = customer?.email?.trim();
  const addressLine1 = customer?.addressLine1?.trim() || "";
  const addressLine2 = customer?.addressLine2?.trim() || "";
  const city = customer?.city?.trim() || "";
  const state = customer?.state?.trim() || "";
  const zip = customer?.zip?.trim() || "";
  const notes = customer?.notes?.trim() || "";

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required." });
  }

  const subtotalCents = parseInt(totals?.subtotalCents ?? 0, 10) || 0;
  const shippingCents = parseInt(totals?.shippingCents ?? 0, 10) || 0;
  const taxCents = parseInt(totals?.taxCents ?? 0, 10) || 0;
  const totalCents = parseInt(totals?.totalCents ?? 0, 10) || 0;

  const orderId = `ord-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

  const newOrder = {
    id: orderId,
    createdAt: new Date().toISOString(),
    items: safeItems,
    customer: {
      name,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      notes,
    },
    totals: {
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
    },
    status: "new",
  };

  orders.push(newOrder);
  saveOrders(orders);

  console.log("New order received:", {
    id: newOrder.id,
    itemCount: newOrder.items.length,
    totalCents: newOrder.totals.totalCents,
  });

  return res.status(201).json({
    ok: true,
    orderId: newOrder.id,
  });
});

// ===== ADMIN PRODUCTS =====
app.get("/api/admin/products", authAdmin, (req, res) => {
  res.json(products);
});

// Create
app.post("/api/admin/products", authAdmin, (req, res) => {
  const { name, description, priceCents, collection, active } = req.body || {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Product name is required." });
  }

  const priceNumber = parseInt(priceCents, 10);
  if (Number.isNaN(priceNumber) || priceNumber < 0) {
    return res
      .status(400)
      .json({ error: "priceCents must be a non-negative number." });
  }

  const coll =
    typeof collection === "string" && collection.trim()
      ? collection.trim()
      : "uncategorized";

  const slugBase =
    coll.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") ||
    "prod";

  const uniqueId = `${slugBase}-${Date.now()}`;

  const newProduct = {
    id: uniqueId,
    name: name.trim(),
    description: (description || "").trim(),
    priceCents: priceNumber,
    collection: coll.toLowerCase(),
    active: active === undefined ? true : !!active,
  };

  products.push(newProduct);
  saveProducts(products);

  return res.status(201).json(newProduct);
});

// Update
app.put("/api/admin/products/:id", authAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description, priceCents, collection, active } = req.body || {};

  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Product not found." });
  }

  if (name !== undefined) {
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Invalid name." });
    }
    products[idx].name = name.trim();
  }

  if (description !== undefined) {
    products[idx].description = (description || "").trim();
  }

  if (priceCents !== undefined) {
    const priceNumber = parseInt(priceCents, 10);
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      return res
        .status(400)
        .json({ error: "priceCents must be a non-negative number." });
    }
    products[idx].priceCents = priceNumber;
  }

  if (collection !== undefined) {
    const coll =
      typeof collection === "string" && collection.trim()
        ? collection.trim()
        : "uncategorized";
    products[idx].collection = coll.toLowerCase();
  }

  if (active !== undefined) {
    products[idx].active = !!active;
  }

  saveProducts(products);
  return res.json(products[idx]);
});

// Delete with image cleanup
app.delete("/api/admin/products/:id", authAdmin, (req, res) => {
  const { id } = req.params;

  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Product not found." });
  }

  const product = products[idx];

  if (product.imageUrl && typeof product.imageUrl === "string") {
    const relative = product.imageUrl.replace(/^\/+/, "");
    const imgPath = path.join(DATA_DIR, relative);
    if (imgPath.startsWith(UPLOADS_DIR) && fs.existsSync(imgPath)) {
      try {
        fs.unlinkSync(imgPath);
      } catch (err) {
        console.warn("Failed to delete image file:", err.message);
      }
    }
  }

  products.splice(idx, 1);
  saveProducts(products);

  return res.json({ ok: true });
});

// ===== ADMIN ORDERS =====
app.get("/api/admin/orders", authAdmin, (req, res) => {
  const fresh = loadOrders(); // in case file was changed externally
  orders = fresh;
  res.json(orders);
});

// Upload image
app.post(
  "/api/admin/products/:id/image",
  authAdmin,
  upload.single("image"),
  (req, res) => {
    const { id } = req.params;

    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Product not found." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded." });
    }

    const relativePath = "/uploads/" + req.file.filename;
    products[idx].imageUrl = relativePath;
    saveProducts(products);

    const product = products[idx];

    return res.json({
      ok: true,
      imageUrl: relativePath,
      product,
    });
  }
);

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Faith & Fragrance backend listening on port ${PORT}`);
});
