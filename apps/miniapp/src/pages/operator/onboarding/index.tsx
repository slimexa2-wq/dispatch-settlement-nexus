import { LifecyclePage } from "../../../components/lifecycle-page";
import { useSession } from "../../../hooks/useSession";

export default function OnboardingPage() {
  const user = useSession();
  return <LifecyclePage mode="onboard" canWrite={Boolean(user?.permissions.includes("people:write"))} />;
}
