const router = require("express").Router();
const Product = require("../models/Product");
const authAdmin = require("../middleware/authAdmin");
const multer = require("multer");
const path = require("path");

// Uploads config
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, req.params.id + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// GET ALL
router.get("/", authAdmin, async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

// CREATE
router.post("/", authAdmin, async (req, res) => {
  const p = await Product.create({
    id: "prod-" + Date.now(),
    ...req.body
  });

  res.json(p);
});

// UPDATE
router.put("/:id", authAdmin, async (req, res) => {
  const updated = await Product.findOneAndUpdate(
    { id: req.params.id },
    req.body,
    { new: true }
  );

  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// DELETE
router.delete("/:id", authAdmin, async (req, res) => {
  await Product.deleteOne({ id: req.params.id });
  res.json({ ok: true });
});

// UPLOAD IMAGE
router.post("/:id/image", authAdmin, upload.single("image"), async (req, res) => {
  const imageUrl = "/uploads/" + req.file.filename;

  const updated = await Product.findOneAndUpdate(
    { id: req.params.id },
    { imageUrl },
    { new: true }
  );

  res.json({ imageUrl: updated.imageUrl });
});

module.exports = router;
