import AccountProfile from "@/components/AccountProfile";

// The account area renders only after the sign-in check, so skip instant-navigation validation.
export const instant = false;

export default function ProfilePage() {
  return <AccountProfile />;
}
