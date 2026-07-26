import { LifecyclePage } from "../../../components/lifecycle-page";
import { useSession } from "../../../hooks/useSession";

export default function OffboardingPage() {
  const user = useSession();
  return <LifecyclePage mode="offboard" canWrite={Boolean(user?.permissions.includes("people:write"))} />;
}
