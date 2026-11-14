import mongoose from "mongoose";

// A customer's shopping cart: one document per customer. Only product, option
// and quantity are stored; names, images and prices are read from the product
// each time the cart is loaded, so they are always current.
const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  quantity: { type: Number, required: true, min: 1 },
});

const cartSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
    },
    items: { type: [cartItemSchema], default: [] },
    // When the "you left something in your cart" email went out (see utils/abandonedCart.js)
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;
