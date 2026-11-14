import { SignupForm } from "~/components/signup-form";
import { useNavigate } from "react-router";
import { useEffect } from "react";

export default function SignupPage() {
  // const navigate = useNavigate();

  // useEffect(() => {
  //   navigate("/sign-in", { replace: true });
  // }, [navigate]);

  
  return <SignupForm />;
}
