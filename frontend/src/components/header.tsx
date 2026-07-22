import Link from "next/link";
import { CircleUserRound, Map, Trophy } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight"
        >
          HOOP<span className="text-orange">MAP</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-bold md:flex">
          <Link href="/map">Карта</Link>
          <Link href="/games">Игры</Link>
          <Link href="/courts/add">Добавить площадку</Link>
        </nav>
        <Link href="/profile" aria-label="Профиль">
          <CircleUserRound />
        </Link>
      </div>
    </header>
  );
}

export function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-line bg-white px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 md:hidden">
      <Link className="flex flex-col items-center text-xs" href="/map">
        <Map size={20} />
        Карта
      </Link>
      <Link className="flex flex-col items-center text-xs" href="/games">
        <Trophy size={20} />
        Игры
      </Link>
      <Link className="flex flex-col items-center text-xs" href="/profile">
        <CircleUserRound size={20} />
        Профиль
      </Link>
    </nav>
  );
}
