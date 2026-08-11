import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { erro: boolean; msg: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: false, msg: "" };

  static getDerivedStateFromError(e: unknown): State {
    return { erro: true, msg: e instanceof Error ? e.message : String(e) };
  }

  componentDidCatch(e: unknown) {
    console.error("[ErrorBoundary]", e);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-fundo gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black bg-marca">B5</div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-tinta">Algo deu errado</p>
          <p className="text-xs text-apoio">Tente recarregar o app. Se o problema persistir, entre em contato com o suporte.</p>
          {this.state.msg && (
            <p className="text-[10px] text-apoio font-mono mt-2 break-all">{this.state.msg}</p>
          )}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-marca">
          Recarregar
        </button>
      </div>
    );
  }
}
