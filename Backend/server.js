// ============================================================================
// Faith & Fragrance Co. – CLEAN FINAL BACKEND
// Stripe handles tax + shipping. Webhook stores final totals + shipping address.
// ============================================================================

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
require("dotenv").config();

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
}

const app = express();
const PORT = process.env.PORT || 4000;

// ============================================================================
// ADMIN CONFIG
// ============================================================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_BASE = process.env.FRONTEND_BASE_URL;

// ============================================================================
// FILE PATHS
// ============================================================================
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const SUBSCRIBERS_FILE = path.join(__dirname, "subscribers.json");
const ORDERS_FILE = path.join(__dirname, "orders.json");
const CUSTOMERS_FILE = path.join(__dirname, "customers.json");
const POS_SALES_FILE = path.join(__dirname, "pos-sales.json");
const DISCOUNTS_FILE = path.join(__dirname, "discounts.json");
const CARTS_FILE = path.join(__dirname, "carts.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// ============================================================================
// JSON HELPERS
// ============================================================================
function loadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
            return fallback;
        }
        return JSON.parse(fs.readFileSync(file));
    } catch {
        return fallback;
    }
}
function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ============================================================================
// LOAD DATA
// ============================================================================
let products = loadJson(PRODUCTS_FILE, []);
let subscribers = loadJson(SUBSCRIBERS_FILE, []);
let orders = loadJson(ORDERS_FILE, []);
let customers = loadJson(CUSTOMERS_FILE, []);
let posSales = loadJson(POS_SALES_FILE, []);
let discounts = loadJson(DISCOUNTS_FILE, []);
let carts = loadJson(CARTS_FILE, []);

// ============================================================================
// EMAIL SERVICE
// ============================================================================
let transporter = null;
if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}
async function sendEmail({ to, subject, text, html }) {
    if (!transporter) return;
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to,
            subject,
            text,
            html,
        });
    } catch { }
}

// ============================================================================
// EXPRESS SETUP
// ============================================================================
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

app.use(cors({ origin: "*"}));

// ============================================================================
// MULTER (image uploads)
// ============================================================================
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, req.params.id + ext);
    },
});
const upload = multer({ storage });

// ============================================================================
// AUTH HELPERS
// ============================================================================
function adminToken() {
    return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "2h" });
}
function customerToken(c) {
    return jwt.sign({ role: "customer", id: c.id, email: c.email }, JWT_SECRET, {
        expiresIn: "7d",
    });
}
function authAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });

    try {
        const decoded = jwt.verify(header.slice(7), JWT_SECRET);
        if (decoded.role !== "admin") return res.status(403).json({ error: "Forbidden" });
        next();
    } catch {
        res.status(401).json({ error: "Invalid token" });
    }
}

// ============================================================================
// NORMALIZE CART ITEMS
// ============================================================================
function resolveCartItems(items) {
    if (!Array.isArray(items)) return [];
    const out = [];

    for (const item of items) {
        const p = products.find((x) => x.id === item.productId);
        if (!p) continue;

        const qty = Number(item.quantity);
        if (qty <= 0) continue;

        out.push({
            productId: p.id,
            name: p.name,
            priceCents: p.priceCents,
            quantity: qty,
        });
    }
    return out;
}

// ============================================================================
// ADMIN LOGIN
// ============================================================================
app.post("/api/admin/login", (req, res) => {
    const { email, password } = req.body;
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
        return res.status(401).json({ error: "Invalid credentials" });

    return res.json({ token: adminToken() });
});

// ============================================================================
// CUSTOMER AUTH
// ============================================================================
app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body;
    const exists = customers.find((c) => c.email === email.toLowerCase());
    if (exists) return res.status(409).json({ error: "Email exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newC = {
        id: "cus-" + Date.now(),
        name,
        email: email.toLowerCase(),
        passwordHash: hashed,
        createdAt: new Date().toISOString(),
    };

    customers.push(newC);
    saveJson(CUSTOMERS_FILE, customers);

    return res.json({
        token: customerToken(newC),
        customer: { id: newC.id, name: newC.name, email: newC.email },
    });
});

app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const c = customers.find((x) => x.email === email.toLowerCase());
    if (!c) return res.status(401).json({ error: "Invalid login" });

    const match = await bcrypt.compare(password, c.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid login" });

    return res.json({
        token: customerToken(c),
        customer: { id: c.id, name: c.name, email: c.email },
    });
});

// ============================================================================
// PUBLIC PRODUCTS
// ============================================================================
app.get("/api/products", (_, res) => {
    res.json(products.filter((p) => p.active !== false));
});

// ============================================================================
// SUBSCRIBE
// ============================================================================
app.post("/api/subscribe", (req, res) => {
    const email = req.body.email?.toLowerCase();
    if (!email) return res.status(400).json({ error: "Email required" });

    if (!subscribers.find((s) => s.email === email)) {
        subscribers.push({ email, joinedAt: new Date().toISOString() });
        saveJson(SUBSCRIBERS_FILE, subscribers);
    }
    res.json({ ok: true });
});

// ============================================================================
// STRIPE CHECKOUT (Stripe handles tax + shipping address)
// ============================================================================
app.post("/api/checkout/session", async (req, res) => {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const { items, customer } = req.body;

    const safeItems = resolveCartItems(items);
    if (!safeItems.length) return res.status(400).json({ error: "Invalid cart" });

    const orderId = "ord-" + Date.now();

    orders.push({
        id: orderId,
        items: safeItems,
        customer: { name: customer.name, email: customer.email },
        status: "pending",
        paymentStatus: "unpaid",
        createdAt: new Date().toISOString(),
    });
    saveJson(ORDERS_FILE, orders);

    try {
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer_email: customer.email,

            line_items: safeItems.map((i) => ({
                price_data: {
                    currency: "usd",
                    product_data: { name: i.name },
                    unit_amount: i.priceCents,
                },
                quantity: i.quantity,
            })),

            automatic_tax: { enabled: true },
            shipping_address_collection: { allowed_countries: ["US"] },

            metadata: { orderId },

            success_url: `${FRONTEND_BASE}/checkout/success.html?orderId=${orderId}`,
            cancel_url: `${FRONTEND_BASE}/checkout/cancel.html?orderId=${orderId}`,
        });

        res.json({ sessionId: session.id });
    } catch (err) {
        res.status(500).json({ error: "Stripe error" });
    }
});

// ============================================================================
// STRIPE WEBHOOK (captures final totals + shipping address)
// ============================================================================
app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    (req, res) => {
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                req.headers["stripe-signature"],
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            return res.status(400).send(`Webhook error: ${err.message}`);
        }

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const orderId = session.metadata.orderId;

            const order = orders.find((o) => o.id === orderId);
            if (!order) return res.json({ received: true });

            order.paymentStatus = "paid";
            order.status = "new";
            order.updatedAt = new Date().toISOString();

            order.totals = {
                totalCents: session.amount_total,
                subtotalCents: session.amount_subtotal,
                taxCents: session.total_details?.amount_tax || 0,
                shippingCents: session.total_details?.amount_shipping || 0,
            };

            order.shipping = session.shipping_details || null;

            saveJson(ORDERS_FILE, orders);

            sendEmail({
                to: order.customer.email,
                subject: `Your order ${order.id}`,
                text: `Thank you! Your order total is $${(
                    session.amount_total / 100
                ).toFixed(2)}`,
            });

            sendEmail({
                to: ADMIN_EMAIL,
                subject: `New Stripe order ${order.id}`,
                text: `Order total: $${(session.amount_total / 100).toFixed(2)}`,
            });
        }

        res.json({ received: true });
    }
);

// ============================================================================
// PRODUCT ADMIN
// ============================================================================
app.get("/api/admin/products", authAdmin, (_, res) => res.json(products));

app.post("/api/admin/products", authAdmin, (req, res) => {
    const { name, priceCents, collection, description, active, stock, trackInventory } =
        req.body;

    if (!name || !priceCents)
        return res.status(400).json({ error: "name & price required" });

    const p = {
        id: "prod-" + Date.now(),
        name,
        priceCents: Number(priceCents),
        collection: (collection || "uncategorized").toLowerCase(),
        description: description || "",
        active: active !== false,
        trackInventory: !!trackInventory,
        stock: stock !== undefined ? Number(stock) : null,
        imageUrl: null,
    };

    products.push(p);
    saveJson(PRODUCTS_FILE, products);

    res.json(p);
});

app.put("/api/admin/products/:id", authAdmin, (req, res) => {
    const p = products.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: "Not found" });

    const { name, priceCents, collection, description, active, stock, trackInventory } =
        req.body;

    if (name !== undefined) p.name = name;
    if (priceCents !== undefined) p.priceCents = Number(priceCents);
    if (collection !== undefined) p.collection = collection.toLowerCase();
    if (description !== undefined) p.description = description;
    if (active !== undefined) p.active = active;
    if (stock !== undefined) p.stock = Number(stock);
    if (trackInventory !== undefined) p.trackInventory = !!trackInventory;

    saveJson(PRODUCTS_FILE, products);
    res.json(p);
});

app.delete("/api/admin/products/:id", authAdmin, (req, res) => {
    products = products.filter((p) => p.id !== req.params.id);
    saveJson(PRODUCTS_FILE, products);
    res.json({ ok: true });
});

app.post(
    "/api/admin/products/:id/image",
    authAdmin,
    upload.single("image"),
    (req, res) => {
        const p = products.find((x) => x.id === req.params.id);
        if (!p) return res.status(404).json({ error: "Not found" });

        p.imageUrl = "/uploads/" + req.file.filename;
        saveJson(PRODUCTS_FILE, products);

        res.json({ imageUrl: p.imageUrl });
    }
);

// ============================================================================
// ADMIN ORDERS
// ============================================================================
app.get("/api/admin/orders", authAdmin, (_, res) => res.json(orders));

app.put("/api/admin/orders/:id", authAdmin, (req, res) => {
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });

    const { status, paymentStatus, trackingNumber } = req.body;

    if (status !== undefined) order.status = status;
    if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;

    order.updatedAt = new Date().toISOString();
    saveJson(ORDERS_FILE, orders);

    res.json(order);
});

// ============================================================================
// SUBSCRIBERS & EMAIL BLAST
// ============================================================================
app.get("/api/admin/subscribers", authAdmin, (_, res) => {
    res.json(subscribers);
});

app.post("/api/admin/email-blast", authAdmin, async (req, res) => {
    const { subject, text, html } = req.body;
    if (!subject || (!text && !html))
        return res.status(400).json({ error: "Subject + content required" });

    for (const sub of subscribers) {
        sendEmail({ to: sub.email, subject, text, html });
    }

    res.json({ ok: true });
});

// ============================================================================
// DISCOUNTS
// ============================================================================
app.get("/api/admin/discounts", authAdmin, (_, res) =>
    res.json(discounts)
);

app.post("/api/admin/discounts", authAdmin, (req, res) => {
    const { code, type, amount } = req.body;

    const exists = discounts.find(
        (d) => d.code.toUpperCase() === code.toUpperCase()
    );
    if (exists) return res.status(409).json({ error: "Exists" });

    const d = {
        id: code.toUpperCase(),
        code: code.toUpperCase(),
        type,
        amount: Number(amount),
        active: true,
        uses: 0,
    };

    discounts.push(d);
    saveJson(DISCOUNTS_FILE, discounts);
    res.json(d);
});

// ============================================================================
// ABANDONED CARTS
// ============================================================================
app.get("/api/admin/abandoned-carts", authAdmin, (_, res) => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const stale = carts.filter(
        (c) => c.status === "open" && new Date(c.createdAt).getTime() < cutoff
    );
    res.json(stale);
});

app.post("/api/admin/abandoned-carts/:id/nudge", authAdmin, (req, res) => {
    const c = carts.find((c) => c.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Not found" });

    sendEmail({
        to: c.email,
        subject: "We saved your cart",
        text: "Return anytime to complete your order.",
    });

    c.lastNudgedAt = new Date().toISOString();
    saveJson(CARTS_FILE, carts);

    res.json({ ok: true });
});

// ============================================================================
// POS SYSTEM
// ============================================================================
const MANUAL_TAX_RATE = Number(process.env.TAX_RATE || 0);
function calcManualTax(sub) {
    return Math.round(sub * MANUAL_TAX_RATE);
}

app.post("/api/pos/sale", authAdmin, (req, res) => {
    const { items, paymentMethod } = req.body;

    const safeItems = resolveCartItems(items);
    if (!safeItems.length) return res.status(400).json({ error: "Invalid sale" });

    const subtotal = safeItems.reduce(
        (sum, i) => sum + i.priceCents * i.quantity,
        0
    );
    const tax = calcManualTax(subtotal);
    const total = subtotal + tax;

    const sale = {
        id: "pos-" + Date.now(),
        items: safeItems,
        totals: {
            subtotalCents: subtotal,
            taxCents: tax,
            totalCents: total,
        },
        paymentMethod: paymentMethod || "cash",
        createdAt: new Date().toISOString(),
    };

    posSales.push(sale);
    saveJson(POS_SALES_FILE, posSales);

    res.json(sale);
});

app.get("/api/admin/pos-sales", authAdmin, (_, res) =>
    res.json(posSales)
);

// ============================================================================
// ROOT
// ============================================================================
app.get("/", (_, res) =>
    res.json({ ok: true, service: "Faith & Fragrance Backend" })
);

app.listen(PORT, () =>
    console.log(`🚀 Backend running on port ${PORT}`)
);