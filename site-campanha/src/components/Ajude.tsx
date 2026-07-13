"use client";

import { useState, type FormEvent } from "react";
import { HeartHandshake } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { aplicarMascaraTelefone } from "@/lib/phoneMask";
import { config } from "@/data/config";

// Ordem fixa do projeto: Santa Bárbara d'Oeste, Americana, Nova Odessa.
const cidades = config.regiaoAtuacao;

type StatusEnvio = "ocioso" | "enviando" | "sucesso" | "erro";

export function Ajude() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState<string>(cidades[0]);
  const [bairro, setBairro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [status, setStatus] = useState<StatusEnvio>("ocioso");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("enviando");

    const { error } = await supabase.from(config.supabase.tabelaLeads).insert({
      nome,
      telefone,
      cidade,
      bairro,
      mensagem,
    });

    if (error) {
      setStatus("erro");
      return;
    }

    setStatus("sucesso");
    setNome("");
    setTelefone("");
    setCidade(cidades[0]);
    setBairro("");
    setMensagem("");
  }

  return (
    <section id="ajude" className="bg-white px-4 py-16 md:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-extrabold text-azul-escuro">
          Ajude a campanha
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
          Deixe seus dados para participar como voluntário em Santa Bárbara d&apos;Oeste,
          Americana ou Nova Odessa.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-10 grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-6 shadow-sm sm:grid-cols-2"
        >
          <div className="sm:col-span-1">
            <label htmlFor="nome" className="text-sm font-semibold text-azul-escuro">
              Nome
            </label>
            <input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/30"
            />
          </div>

          <div className="sm:col-span-1">
            <label htmlFor="telefone" className="text-sm font-semibold text-azul-escuro">
              Telefone
            </label>
            <input
              id="telefone"
              required
              inputMode="tel"
              placeholder="(19) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(aplicarMascaraTelefone(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/30"
            />
          </div>

          <div className="sm:col-span-1">
            <label htmlFor="cidade" className="text-sm font-semibold text-azul-escuro">
              Cidade
            </label>
            <select
              id="cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/30"
            >
              {cidades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-1">
            <label htmlFor="bairro" className="text-sm font-semibold text-azul-escuro">
              Bairro
            </label>
            <input
              id="bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/30"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="mensagem" className="text-sm font-semibold text-azul-escuro">
              Mensagem
            </label>
            <textarea
              id="mensagem"
              rows={4}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/30"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={status === "enviando"}
              className="w-full rounded-full bg-azul px-8 py-3 font-semibold text-white shadow transition hover:bg-azul-claro disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {status === "enviando" ? "Enviando..." : "Quero ajudar"}
            </button>

            {status === "sucesso" && (
              <p className="mt-3 font-medium text-green-700">
                Recebemos seus dados. Obrigado por ajudar a campanha!
              </p>
            )}
            {status === "erro" && (
              <p className="mt-3 font-medium text-vermelho">
                Não foi possível enviar agora. Tente novamente em instantes.
              </p>
            )}
          </div>
        </form>

        <div className="mt-10 rounded-2xl bg-azul-escuro p-6 text-center text-white shadow-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <HeartHandshake size={24} />
          </div>
          <h3 className="mt-3 text-xl font-bold">Quer contribuir financeiramente?</h3>
          <p className="mt-2 text-white/80">
            As doações são feitas exclusivamente pelo canal oficial de arrecadação da
            campanha.
          </p>
          <a
            href={config.doacao.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-full bg-vermelho px-8 py-3 font-semibold text-white shadow transition hover:bg-vermelho/90"
          >
            Doar pelo canal oficial
          </a>
        </div>
      </div>
    </section>
  );
}
