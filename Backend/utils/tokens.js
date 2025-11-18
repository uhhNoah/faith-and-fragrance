const jwt = require("jsonwebtoken");

module.exports = {
  adminToken() {
    return jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });
  },

  customerToken(customer) {
    return jwt.sign(
      { role: "customer", id: customer.id, email: customer.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
  }
};
