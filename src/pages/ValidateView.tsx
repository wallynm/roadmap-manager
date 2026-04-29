import { useParams } from "react-router-dom";
import { ValidationPanel } from "@/components/validation/ValidationPanel";

export function ValidateView() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ValidationPanel repoId={repoId!} />;
}
