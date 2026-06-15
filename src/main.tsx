import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// ── DIAGNÓSTICO — remover após identificar o erro ──────────────────────────
window.onerror = (msg, src, line, _col, err) => {
  document.body.style.cssText = "padding:16px;font-family:monospace;font-size:13px;background:#fff;";
  document.body.innerHTML =
    `<b style="color:red">ERRO JS:</b><br>${msg}<br>em ${src}:${line}<br><br><pre style="white-space:pre-wrap;word-break:break-all">${err?.stack ?? ""}</pre>`;
};
window.onunhandledrejection = (e) => {
  document.body.innerHTML +=
    `<br><b style="color:orange">Promise rejeitada:</b><br>${String(e.reason)}`;
};

interface EBState { err: Error | null }
class EB extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { err: null };
  static getDerivedStateFromError(e: Error): EBState { return { err: e }; }
  render() {
    const { err } = this.state;
    if (err)
      return (
        <pre style={{ padding: 16, fontSize: 12, color: "red", wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
          {"ERRO REACT:\n"}{err.message}{"\n\n"}{err.stack}
        </pre>
      );
    return this.props.children;
  }
}
// ── fim diagnóstico ─────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")!).render(
  <EB>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </EB>
);
