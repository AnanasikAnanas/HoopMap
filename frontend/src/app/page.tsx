import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Header, MobileNav } from "@/components/header";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <section className="court-lines relative overflow-hidden border-b border-line px-4 py-20 lg:py-28">
          <div className="pointer-events-none absolute -right-40 top-8 h-[520px] w-[520px] rounded-full border-[40px] border-orange/10" />
          <div className="relative mx-auto max-w-7xl">
            <p className="mb-5 text-sm font-extrabold uppercase tracking-[.22em] text-orange">
              Баскетбол рядом
            </p>
            <h1 className="display max-w-5xl text-4xl font-bold leading-tight md:text-6xl lg:text-7xl">
              НАЙДИ ПЛОЩАДКУ.
              <br />
              <span className="text-orange">СОБЕРИ ИГРУ.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg text-muted">
              Живая карта баскетбольных площадок, актуальная информация от
              игроков и открытые игры в твоём городе.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/map"
                className="flex min-h-12 items-center gap-2 rounded-full bg-orange px-6 font-bold text-white"
              >
                Открыть карту <ArrowRight size={18} />
              </Link>
              <Link
                href="/courts/add"
                className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-white px-6 font-bold"
              >
                <Plus size={18} /> Добавить площадку
              </Link>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Search,
                title: "Найди",
                text: "Открой карту и выбери площадку по покрытию, кольцам и освещению.",
              },
              {
                icon: Trophy,
                title: "Сыграй",
                text: "Присоединись к открытой игре или создай свою за пару минут.",
              },
              {
                icon: ShieldCheck,
                title: "Подтверди",
                text: "Помоги сообществу: подтверди данные или сообщи об изменениях.",
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article
                key={title}
                className="rounded-3xl border border-line bg-white p-7"
              >
                <span className="mb-10 flex h-12 w-12 items-center justify-center rounded-full bg-orange/10 text-orange">
                  <Icon />
                </span>
                <span className="text-xs font-bold text-muted">0{i + 1}</span>
                <h2 className="display mt-2 text-xl">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="bg-dark px-4 py-16 text-white">
          <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <MapPin className="text-orange" />
              <h2 className="display mt-4 text-3xl">
                Твоя площадка ещё не на карте?
              </h2>
              <p className="mt-4 text-white/60">
                Добавь её. После проверки она станет доступна всем игрокам.
              </p>
            </div>
            {[
              ["20+", "площадок в тестовом городе"],
              ["50 м", "радиус проверки дубликатов"],
            ].map(([v, l]) => (
              <div key={l}>
                <p className="display text-4xl text-orange">{v}</p>
                <p className="mt-2 text-sm text-white/60">{l}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <MobileNav />
    </>
  );
}
