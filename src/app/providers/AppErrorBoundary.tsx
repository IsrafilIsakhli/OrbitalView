import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  public state: BoundaryState = { hasError: false };

  public static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Orbital Vision render failure", error, info.componentStack);
  }

  public render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function ErrorFallback() {
  const { t } = useTranslation(["shell", "common"]);

  return (
    <main className="fatal-error" role="alert">
      <div className="fatal-error__glow" />
      <BrandMark className="fatal-error__mark" />
      <p className="eyebrow">{t("shell:errors.title")}</p>
      <h1>{t("shell:errors.description")}</h1>
      <button className="primary-button" onClick={() => window.location.reload()} type="button">
        {t("common:actions.retry")}
      </button>
    </main>
  );
}

import { BrandMark } from "@/shared/ui/BrandMark";

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallback={<ErrorFallback />}>{children}</ErrorBoundary>;
}
