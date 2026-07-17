import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render crashed", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-foreground">
        <h1 className="text-lg font-semibold">MiniMarkdown</h1>
        <p className="text-sm text-muted-foreground">界面启动时遇到错误，请把下面的信息发给我。</p>
        <pre className="max-w-3xl overflow-auto rounded-md border border-border bg-card px-4 py-3 text-left text-xs text-foreground/85">
          {this.state.error.stack || this.state.error.message}
        </pre>
      </div>
    );
  }
}
