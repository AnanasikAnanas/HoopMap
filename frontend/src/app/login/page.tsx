import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { EmailAuthForm } from "@/components/email-auth-form";
import { Header, MobileNav } from "@/components/header";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
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
  const oidcConfigured = Boolean(
    process.env.TELEGRAM_LOGIN_CLIENT_ID?.trim() &&
    process.env.TELEGRAM_LOGIN_CLIENT_SECRET?.trim(),
  );
  const widgetConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() &&
    process.env.TELEGRAM_BOT_USERNAME?.trim(),
  );
  const loginHref = `/api/v1/auth/telegram/start/?${new URLSearchParams({
    next,
  })}`;
  const googleLoginHref = `/api/v1/auth/google/start/?${new URLSearchParams({
    next,
  })}`;

  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-xl items-center px-4 py-10 pb-24">
        <Card className="w-full p-6 text-center md:p-9">
          <p className="text-xs font-bold uppercase tracking-widest text-orange">
            Аккаунт игрока
          </p>
          <h1 className="display mt-2 text-3xl">Войти в HOOPMAP</h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            Создайте независимый аккаунт по email или используйте Telegram.
            Площадки, игры и избранное сохраняются в вашем профиле.
          </p>

          {params.confirmed === "1" && (
            <p className="mt-5 rounded-2xl bg-success/10 p-4 text-sm font-bold text-success">
              Email подтверждён. Теперь можно войти с паролем.
            </p>
          )}
          {params.error === "telegram" && (
            <p className="mt-5 rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
              Telegram не подтвердил вход. Попробуйте ещё раз.
            </p>
          )}
          {params.error === "google" && (
            <p className="mt-5 rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
              Google не подтвердил вход. Попробуйте ещё раз.
            </p>
          )}

          <div className="mt-7">
            <EmailAuthForm next={next} />
          </div>

          <div className="my-7 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-muted">
            <span className="h-px flex-1 bg-line" />
            или
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="space-y-3">
            <a
              href={googleLoginHref}
              className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-surface px-6 text-sm font-bold text-ink transition hover:border-muted hover:bg-canvas"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                <path
                  fill="#4285F4"
                  d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.89h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.37Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 4.98-.9 6.63-2.4l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.39 13.91A6.02 6.02 0 0 1 6.08 12c0-.66.11-1.3.31-1.91v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.51l3.35-2.6Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.35 2.6C7.18 7.72 9.39 5.96 12 5.96Z"
                />
              </svg>
              Продолжить с Google
            </a>

            {oidcConfigured ? (
              <a
                href={loginHref}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#229ED9] px-6 text-sm font-bold text-white transition hover:bg-[#198bc1]"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-5 w-5 fill-current"
                >
                  <path d="M21.8 3.6c.3-1.3-.5-1.8-1.6-1.4L2.7 9c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 10.4-6.6c.5-.3 1-.1.6.3l-8.4 7.6-.3 4.6c.5 0 .7-.2 1-.5l2.2-2.1 4.5 3.3c.8.5 1.4.2 1.6-.8l3.2-14.1Z" />
                </svg>
                Продолжить в Telegram <ArrowRight size={18} />
              </a>
            ) : widgetConfigured ? (
              <TelegramLoginWidget next={next} />
            ) : (
              <p className="rounded-2xl bg-canvas p-4 text-sm text-muted">
                Вход через Telegram пока не настроен. Email-регистрация
                доступна.
              </p>
            )}
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-canvas p-4 text-left">
            <ShieldCheck className="mt-0.5 shrink-0 text-success" size={20} />
            <p className="text-xs leading-5 text-muted">
              Пароль обрабатывает Supabase Auth и не сохраняется в базе HOOPMAP.
              Telegram для email-аккаунта не требуется.
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
