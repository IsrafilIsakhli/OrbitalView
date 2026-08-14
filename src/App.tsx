import { AppProviders } from "@/app/providers/AppProviders";
import { AppShell } from "@/app/shell/AppShell";

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
