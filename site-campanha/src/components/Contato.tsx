import { Instagram, Facebook, MessageCircle, Mail } from "lucide-react";
import { config } from "@/data/config";

export function Contato() {
  return (
    <section id="contato" className="bg-slate-50 px-4 py-16 md:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-extrabold text-azul-escuro">Contato e Redes</h2>
        <p className="mt-2 text-slate-600">
          Siga e fale diretamente com a equipe da pré-campanha.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href={config.redesSociais.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full bg-azul px-6 py-3 font-medium text-white shadow transition hover:bg-azul-claro"
          >
            <Instagram size={20} />
            Instagram
          </a>
          <a
            href={config.redesSociais.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full bg-azul px-6 py-3 font-medium text-white shadow transition hover:bg-azul-claro"
          >
            <Facebook size={20} />
            Facebook
          </a>
          <a
            href={config.redesSociais.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full bg-vermelho px-6 py-3 font-medium text-white shadow transition hover:bg-vermelho/90"
          >
            <MessageCircle size={20} />
            WhatsApp
          </a>
          <a
            href={`mailto:${config.contato.email}`}
            className="flex items-center gap-2 rounded-full border border-azul px-6 py-3 font-medium text-azul transition hover:bg-azul/5"
          >
            <Mail size={20} />
            E-mail
          </a>
        </div>
      </div>
    </section>
  );
}
