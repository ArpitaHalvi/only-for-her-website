import AccountDashboard from "@/components/AccountDashboard";

// The account area renders only after the sign-in check, so skip instant-navigation validation.
export const instant = false;

export default function AccountPage() {
  return <AccountDashboard />;
}
