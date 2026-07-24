import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Header, MobileNav } from "@/components/header";
import { Card } from "@/components/ui";

function safeNext(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith("/") && !path.startsWith("//")
    ? path.slice(0, 500)
    : "/profile";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const configured = Boolean(
    process.env.TELEGRAM_LOGIN_CLIENT_ID?.trim() &&
      process.env.TELEGRAM_LOGIN_CLIENT_SECRET?.trim(),
  );
  const loginHref = `/api/v1/auth/telegram/start/?${new URLSearchParams({
    next,
  })}`;

  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-lg items-center px-4 py-10 pb-24">
        <Card className="w-full p-6 text-center md:p-9">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#229ED9]/10 text-[#229ED9]">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-8 w-8 fill-current"
            >
              <path d="M21.8 3.6c.3-1.3-.5-1.8-1.6-1.4L2.7 9c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 10.4-6.6c.5-.3 1-.1.6.3l-8.4 7.6-.3 4.6c.5 0 .7-.2 1-.5l2.2-2.1 4.5 3.3c.8.5 1.4.2 1.6-.8l3.2-14.1Z" />
            </svg>
          </span>
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-orange">
            Единый профиль
          </p>
          <h1 className="display mt-2 text-3xl">Войти через Telegram</h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            На сайте откроется тот же профиль, что и в Telegram Mini App:
            избранное, площадки, игры и роль модератора будут общими.
          </p>

          {params.error === "telegram" && (
            <p className="mt-5 rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
              Telegram не подтвердил вход. Попробуйте ещё раз.
            </p>
          )}

          {configured ? (
            <a
              href={loginHref}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#229ED9] px-6 text-sm font-bold text-white transition hover:bg-[#198bc1]"
            >
              Продолжить в Telegram <ArrowRight size={18} />
            </a>
          ) : (
            <p className="mt-7 rounded-2xl bg-warning/10 p-4 text-sm font-bold text-warning">
              Вход на сайте ещё не настроен администратором.
            </p>
          )}

          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-canvas p-4 text-left">
            <ShieldCheck className="mt-0.5 shrink-0 text-success" size={20} />
            <p className="text-xs leading-5 text-muted">
              Пароль Telegram не передаётся HOOPMAP. Мы получаем только
              подтверждённый идентификатор и открытые данные профиля.
            </p>
          </div>
          <Link
            href="/"
            className="mt-6 inline-flex text-sm font-bold text-muted hover:text-orange"
          >
            Вернуться на главную
          </Link>
        </Card>
      </main>
      <MobileNav />
    </>
  );
}
