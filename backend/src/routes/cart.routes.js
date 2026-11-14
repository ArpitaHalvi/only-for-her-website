import { Router } from "express";
import { ensureCustomer } from "../middleware/customerAuthMiddleware.js";
import { viewCart, addItem, setQuantity, removeItem, clearCart } from "../controllers/cart.controller.js";
import { mergeCart } from "../controllers/customerExtras.controller.js";

const router = Router();

// The cart belongs to a signed-in customer
router.use(ensureCustomer);

router.get("/", viewCart);
router.delete("/", clearCart);
router.post("/merge", mergeCart); // guest cart -> account cart after sign-in
router.post("/items", addItem);
router.patch("/items/:itemId", setQuantity);
router.delete("/items/:itemId", removeItem);

export default router;
