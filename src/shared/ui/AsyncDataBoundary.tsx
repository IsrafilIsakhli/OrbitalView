import type { ReactNode } from "react";

interface AsyncDataBoundaryProps {
  children: ReactNode;
  empty?: boolean;
  emptyState?: ReactNode;
  error: boolean;
  errorState: ReactNode;
  loading: boolean;
  loadingState: ReactNode;
}

export function AsyncDataBoundary({ children, empty, emptyState, error, errorState, loading, loadingState }: AsyncDataBoundaryProps) {
  if (loading) return loadingState;
  if (error) return errorState;
  if (empty) return emptyState ?? null;
  return children;
}
