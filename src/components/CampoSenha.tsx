import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function CampoSenha({ valor, aoMudar, placeholder }:
  { valor: string; aoMudar: (v: string) => void; placeholder?: string }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input className="w-full rounded-xl px-3 py-3 pr-11 text-sm outline-none border border-linha bg-white"
        type={visivel ? "text" : "password"} placeholder={placeholder ?? "Senha"}
        value={valor} onChange={(e) => aoMudar(e.target.value)} />
      <button type="button" onClick={() => setVisivel(!visivel)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-apoio">
        {visivel ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
