import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Knowledge Workspace rendering failed", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-loading is-error">
          <div className="brand-mark">!</div>
          <strong>页面内容暂时无法显示</strong>
          <span>已拦截异常，其他文档和数据不受影响。</span>
          <button type="button" onClick={() => window.location.reload()}>重新加载</button>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
