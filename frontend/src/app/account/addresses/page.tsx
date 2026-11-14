import AccountAddresses from "@/components/AccountAddresses";

// The account area renders only after the sign-in check, so skip instant-navigation validation.
export const instant = false;

export default function AddressesPage() {
  return <AccountAddresses />;
}
