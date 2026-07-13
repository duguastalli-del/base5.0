import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Sobre } from "@/components/Sobre";
import { Propostas } from "@/components/Propostas";
import { Agenda } from "@/components/Agenda";
import { Midia } from "@/components/Midia";
import { Ajude } from "@/components/Ajude";
import { Contato } from "@/components/Contato";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Sobre />
        <Propostas />
        <Agenda />
        <Midia />
        <Ajude />
        <Contato />
      </main>
      <Footer />
    </>
  );
}
