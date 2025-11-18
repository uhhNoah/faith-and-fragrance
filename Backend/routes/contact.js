const router = require("express").Router();
const sendEmail = require("../utils/email");

// CONTACT FORM
router.post("/", async (req, res) => {
  try {
    const { name, email, topic, message } = req.body;

    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Contact Form: ${topic}`,
      text: `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit form" });
  }
});

module.exports = router;
