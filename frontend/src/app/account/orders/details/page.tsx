import AccountOrderDetails from "@/components/AccountOrderDetails";

// The account area renders only after the sign-in check, so skip instant-navigation validation.
export const instant = false;

export default function OrderDetailsPage() {
  return <AccountOrderDetails />;
}
