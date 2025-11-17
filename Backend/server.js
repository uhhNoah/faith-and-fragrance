// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const { URL } = require("url");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// ===== SIMPLE ADMIN CONFIG =====
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "admin@faith-and-fragrance-co.com";
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "ChangeThisPassword123!"; // CHANGE THIS
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SECRET";

// Frontend base URL used for OAuth redirects
// e.g. https://faithandfragrance.netlify.app
const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost:3000";

// Google / Facebook OAuth credentials (set these in .env for real use)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

// ===== FILE PATHS =====
const DATA_DIR = __dirname;
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json"); // new
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
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(normalized, null, 2), "utf8");
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
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing subscribers file:", err);
  }
}

// ===== ORDERS (NEW) =====
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

// ===== AUTH HELPERS =====
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

// Generic token decode (for customers or admin)
function decodeTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
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

// Initialize passport (for OAuth)
app.use(passport.initialize());

// ===== PASSPORT STRATEGIES (GOOGLE / FACEBOOK) =====
function buildUserFromProfile(provider, profile) {
  let email = "";
  if (Array.isArray(profile.emails) && profile.emails.length > 0) {
    email = profile.emails[0].value;
  }
  return {
    provider,
    providerId: profile.id,
    name: profile.displayName || "",
    email: email || "",
  };
}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback",
      },
      (accessToken, refreshToken, profile, done) => {
        return done(null, buildUserFromProfile("google", profile));
      }
    )
  );
} else {
  console.warn("Google OAuth not configured (missing client ID/secret).");
}

if (FACEBOOK_APP_ID && FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: FACEBOOK_APP_ID,
        clientSecret: FACEBOOK_APP_SECRET,
        callbackURL: "/auth/facebook/callback",
        profileFields: ["id", "displayName", "emails"],
      },
      (accessToken, refreshToken, profile, done) => {
        return done(null, buildUserFromProfile("facebook", profile));
      }
    )
  );
} else {
  console.warn("Facebook OAuth not configured (missing app ID/secret).");
}

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

// Generic /api/me to introspect any JWT (customer or admin)
app.get("/api/me", (req, res) => {
  const payload = decodeTokenFromRequest(req);
  if (!payload) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  res.json(payload);
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

// ===== ORDERS API (NEW) =====
// Frontend will POST cart + customer info here.
// NOTE: no payment integration yet – this simply records the order.
app.post("/api/orders", (req, res) => {
  const { items, customer } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "Order must include at least one item." });
  }

  const orders = loadOrders();

  // Validate items and snapshot current product data
  const lineItems = [];
  let subtotalCents = 0;

  for (const rawItem of items) {
    const productId = rawItem && rawItem.productId;
    const quantity = parseInt(rawItem && rawItem.quantity, 10) || 0;

    if (!productId || quantity <= 0) {
      return res.status(400).json({ error: "Invalid cart item." });
    }

    const product = products.find((p) => p.id === productId && p.active !== false);
    if (!product) {
      return res
        .status(400)
        .json({ error: `Product not found or inactive: ${productId}` });
    }

    const lineTotal = product.priceCents * quantity;
    subtotalCents += lineTotal;

    lineItems.push({
      productId: product.id,
      name: product.name,
      collection: product.collection,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: lineTotal,
    });
  }

  const now = new Date();
  const orderId = `ord-${now.getTime()}`;

  const userPayload = decodeTokenFromRequest(req);

  const safeCustomer = {
    name: (customer && customer.name ? String(customer.name) : "").trim(),
    email: (customer && customer.email ? String(customer.email) : "").trim(),
    phone: (customer && customer.phone ? String(customer.phone) : "").trim(),
    address: (customer && customer.address ? String(customer.address) : "").trim(),
    notes: (customer && customer.notes ? String(customer.notes) : "").trim(),
  };

  const order = {
    id: orderId,
    createdAt: now.toISOString(),
    status: "pending", // later: paid / shipped etc.
    items: lineItems,
    subtotalCents,
    totalCents: subtotalCents, // placeholder – add tax/shipping later
    customer: safeCustomer,
    user: userPayload
      ? {
          sub: userPayload.sub || null,
          email: userPayload.email || null,
          name: userPayload.name || null,
          provider: userPayload.provider || null,
        }
      : null,
  };

  orders.push(order);
  saveOrders(orders);

  console.log("New order:", {
    id: order.id,
    subtotalCents: order.subtotalCents,
    items: order.items.length,
  });

  res.status(201).json({
    message: "Order received. We’ll follow up by email.",
    orderId,
  });
});

// Simple order lookup by id (no auth for now – can lock later)
app.get("/api/orders/:id", (req, res) => {
  const orders = loadOrders();
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Order not found." });
  }
  res.json(order);
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

// ===== OAUTH ROUTES (GOOGLE / FACEBOOK) =====

// Google login
app.get("/auth/google", (req, res, next) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res
      .status(503)
      .json({ error: "Google login not configured on server." });
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res, next);
});

// Google callback
app.get("/auth/google/callback", (req, res, next) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).send("Google login not configured.");
  }

  passport.authenticate(
    "google",
    { session: false },
    (err, user /* from buildUserFromProfile */) => {
      if (err || !user) {
        console.error("Google auth error:", err);
        return res.redirect(FRONTEND_BASE_URL + "/auth-error.html");
      }

      const token = jwt.sign(
        {
          sub: `${user.provider}:${user.providerId}`,
          provider: user.provider,
          name: user.name,
          email: user.email,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      const redirectUrl = new URL(
        FRONTEND_BASE_URL.replace(/\/+$/, "") + "/auth-callback.html"
      );
      redirectUrl.searchParams.set("token", token);
      redirectUrl.searchParams.set("provider", "google");

      res.redirect(redirectUrl.toString());
    }
  )(req, res, next);
});

// Facebook login
app.get("/auth/facebook", (req, res, next) => {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    return res
      .status(503)
      .json({ error: "Facebook login not configured on server." });
  }
  passport.authenticate("facebook", {
    scope: ["email"],
  })(req, res, next);
});

// Facebook callback
app.get("/auth/facebook/callback", (req, res, next) => {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    return res.status(503).send("Facebook login not configured.");
  }

  passport.authenticate(
    "facebook",
    { session: false },
    (err, user) => {
      if (err || !user) {
        console.error("Facebook auth error:", err);
        return res.redirect(FRONTEND_BASE_URL + "/auth-error.html");
      }

      const token = jwt.sign(
        {
          sub: `${user.provider}:${user.providerId}`,
          provider: user.provider,
          name: user.name,
          email: user.email,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      const redirectUrl = new URL(
        FRONTEND_BASE_URL.replace(/\/+$/, "") + "/auth-callback.html"
      );
      redirectUrl.searchParams.set("token", token);
      redirectUrl.searchParams.set("provider", "facebook");

      res.redirect(redirectUrl.toString());
    }
  )(req, res, next);
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Faith & Fragrance backend listening on port ${PORT}`);
});
