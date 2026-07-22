import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import { supabase, type Perfil } from "../lib/supabase";
import EventoModal, { type Evento } from "../components/EventoModal";
import { Plus, Calendar, List, Bell, BellOff, CalendarDays } from "lucide-react";

export default function Agenda({ perfil }: { perfil: Perfil }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [vista, setVista] = useState<"listMonth" | "dayGridMonth">("listMonth");
  const [modal, setModal] = useState<{ evento: Evento | null; dataInicial?: string } | null>(null);
  const [permNotif, setPermNotif] = useState<NotificationPermission>("default");
  const [toastGcal, setToastGcal] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Notification permission state
  useEffect(() => {
    if ("Notification" in window) setPermNotif(Notification.permission);
  }, []);

  const pedirPermissao = async () => {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPermNotif(p);
  };

  const agendarNotificacao = (ev: Evento) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const lembrete = ev.lembrete_minutos ?? 0;
    if (!lembrete) return;
    const inicio = new Date(ev.inicio);
    const atraso = inicio.getTime() - lembrete * 60 * 1000 - Date.now();
    if (atraso <= 0) return; // já passou
    setTimeout(() => {
      const label = lembrete >= 60 ? `${lembrete / 60}h` : `${lembrete}min`;
      new Notification(`📅 ${ev.titulo ?? ""}`, {
        body: `Começa em ${label}${ev.local ? ` • ${ev.local}` : ev.cidade ? ` • ${ev.cidade}` : ""}`,
      });
    }, atraso);
  };

  const carregar = async () => {
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("workspace_id", perfil.workspace_id)
      .order("inicio");
    setEventos((data as Evento[]) ?? []);
  };

  // Initial load + Realtime subscription
  useEffect(() => {
    carregar();

    channelRef.current = supabase
      .channel(`agenda-${perfil.workspace_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `workspace_id=eq.${perfil.workspace_id}`,
        },
        () => carregar()
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [perfil.workspace_id]);

  // Agendar notificações para todos os eventos futuros ao carregar
  useEffect(() => {
    if (permNotif === "granted") {
      eventos.forEach((ev) => agendarNotificacao(ev));
    }
  }, [eventos, permNotif]);

  const fcEventos = eventos.map((e) => ({
    id: e.id,
    title: e.titulo ?? "",
    start: e.inicio,
    end: e.fim ?? undefined,
    extendedProps: e,
  }));

  const abrirModal = (evento: Evento | null, dataInicial?: string) =>
    setModal({ evento, dataInicial });

  return (
    <div className="space-y-3 pb-4">
      {/* Barra de ações */}
      <div className="flex items-center gap-2">
        <button onClick={() => abrirModal(null)}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 text-white bg-marca">
          <Plus size={16} /> Novo evento
        </button>

        <button onClick={() => setVista((v) => v === "listMonth" ? "dayGridMonth" : "listMonth")}
          title={vista === "listMonth" ? "Ver calendário" : "Ver lista"}
          className="rounded-xl p-2.5 border border-linha bg-white text-apoio active:bg-fundo">
          {vista === "listMonth" ? <Calendar size={18} /> : <List size={18} />}
        </button>

        {permNotif !== "granted" ? (
          <button onClick={pedirPermissao} title="Ativar lembretes de eventos"
            className="rounded-xl p-2.5 border border-linha bg-white text-apoio active:bg-fundo">
            <BellOff size={18} />
          </button>
        ) : (
          <div title="Lembretes ativos" className="rounded-xl p-2.5 border border-green-200 bg-green-50 text-ok">
            <Bell size={18} />
          </div>
        )}
      </div>

      {/* Google Calendar — code-ready, provider não habilitado ainda */}
      <button
        onClick={() => { setToastGcal(true); setTimeout(() => setToastGcal(false), 4000); }}
        className="w-full rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-2 text-apoio border border-dashed border-linha bg-white">
        <CalendarDays size={14} /> Conectar Google Calendar (em breve)
      </button>

      {toastGcal && (
        <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 text-xs text-alerta leading-relaxed">
          A integração com Google Calendar será habilitada em sessão futura. O resto da agenda funciona normalmente sem ela.
        </div>
      )}

      {/* FullCalendar */}
      <div className="bg-white rounded-xl border border-linha overflow-hidden agenda-cal">
        <FullCalendar
          key={vista}
          plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
          initialView={vista}
          locales={[ptBrLocale]}
          locale="pt-br"
          events={fcEventos}
          height="auto"
          headerToolbar={{
            left: "prev",
            center: "title",
            right: "next today",
          }}
          buttonText={{ today: "Hoje" }}
          noEventsText="Nenhum evento neste período."
          dateClick={(info) => abrirModal(null, info.dateStr)}
          eventClick={(info) => {
            const props = info.event.extendedProps as Evento;
            abrirModal({ ...props, id: info.event.id });
          }}
          eventColor="#0E5E6F"
          eventBorderColor="#0A4753"
          dayMaxEvents={3}
        />
      </div>

      {/* CSS overrides inline para não conflitar com Tailwind reset */}
      <style>{`
        .agenda-cal .fc { font-family: inherit; font-size: 13px; }
        .agenda-cal .fc-toolbar-title { font-size: 14px; font-weight: 700; color: #1C2530; }
        .agenda-cal .fc-button {
          background: #fff !important; border: 1px solid #E3E8EC !important;
          color: #5C6B7A !important; font-size: 12px !important;
          padding: 4px 10px !important; border-radius: 8px !important;
          box-shadow: none !important;
        }
        .agenda-cal .fc-button:hover { background: #F2F4F6 !important; }
        .agenda-cal .fc-button-active { background: #0E5E6F !important; color: #fff !important; border-color: #0E5E6F !important; }
        .agenda-cal .fc-list-event:hover td { background: #F2F4F6; }
        .agenda-cal .fc-list-day-cushion { background: #F2F4F6; color: #5C6B7A; font-size: 11px; }
        .agenda-cal .fc-daygrid-day-number { color: #1C2530; font-size: 12px; }
        .agenda-cal .fc-daygrid-day.fc-day-today { background: #EFF9FB; }
        .agenda-cal .fc-event { border-radius: 6px !important; font-size: 11px !important; }
        .agenda-cal .fc-list-event-title { color: #1C2530; }
        .agenda-cal .fc-list-empty { padding: 24px; text-align: center; color: #5C6B7A; }
      `}</style>

      {modal !== null && (
        <EventoModal
          perfil={perfil}
          evento={modal.evento}
          dataInicial={modal.dataInicial}
          onFechar={() => setModal(null)}
          onAlterado={() => { carregar(); setModal(null); }}
          agendarNotificacao={agendarNotificacao}
        />
      )}
    </div>
  );
}
