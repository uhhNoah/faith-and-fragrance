const router = require("express").Router();
const Stripe = require("stripe");
const Product = require("../models/Product");
const Order = require("../models/Order");
const sendEmail = require("../utils/email");

const stripe = process.env.STRIPE_SECRET_KEY
  ? Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const FRONTEND = process.env.FRONTEND_BASE_URL;

// Resolve cart items safely
async function resolveCartItems(items) {
  const out = [];

  for (const item of items) {
    const p = await Product.findOne({ id: item.productId });
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

// CREATE STRIPE SESSION
router.post("/session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const { items, customer } = req.body;

    if (!items || !customer)
      return res.status(400).json({ error: "Invalid payload" });

    const safeItems = await resolveCartItems(items);
    if (!safeItems.length)
      return res.status(400).json({ error: "Invalid cart" });

    const orderId = "ord-" + Date.now();

    // TEMP order before payment
    await Order.create({
      id: orderId,
      items: safeItems,
      customer: {
        name: customer.name,
        email: customer.email,
      },
      status: "pending",
      paymentStatus: "unpaid",
    });

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
      shipping_address_collection: {
        allowed_countries: ["US"],
      },
      metadata: { orderId },
      success_url: `${FRONTEND}/checkout/success.html?orderId=${orderId}`,
      cancel_url: `${FRONTEND}/checkout/cancel.html?orderId=${orderId}`,
    });

    res.json({ sessionId: session.id });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// STRIPE WEBHOOK ROUTE
router.post(
  "/webhook",
  require("express").raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripe) return res.status(200).json({ received: true });

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature error:", err.message);
      return res.status(400).send(`Webhook error: ${err.message}`);
    }

    // Handle payment completion
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata.orderId;

      const order = await Order.findOne({ id: orderId });
      if (!order) return res.json({ received: true });

      // Auto inventory deduction
      for (const item of order.items) {
        const product = await Product.findOne({ id: item.productId });

        if (product && product.trackInventory) {
          let newStock = (product.stock ?? 0) - item.quantity;

          if (newStock < 0) newStock = 0;

          product.stock = newStock;
          await product.save();
        }
      }

      // Update order
      order.paymentStatus = "paid";
      order.status = "new";

      order.totals = {
        totalCents: session.amount_total,
        subtotalCents: session.amount_subtotal,
        taxCents: session.total_details?.amount_tax || 0,
        shippingCents: session.total_details?.amount_shipping || 0,
      };

      order.shipping = session.shipping_details || null;

      await order.save();

      // Email user
      sendEmail({
        to: order.customer.email,
        subject: `Your order ${order.id}`,
        text: `Thank you! Your order total is $${(session.amount_total / 100).toFixed(2)}.`,
      });

      // Email admin
      sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `New order: ${order.id}`,
        text: `Order total: $${(session.amount_total / 100).toFixed(2)}`,
      });
    }

    res.json({ received: true });
  }
);

module.exports = router;
