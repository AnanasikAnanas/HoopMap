"use client";
import { useQuery } from "@tanstack/react-query";
import { CourtCard } from "./court-card";
import { Header, MobileNav } from "./header";
import { courtsApi } from "@/lib/api";
export function ProfileCourts({
  mode,
  title,
}: {
  mode: "favorite" | "mine";
  title: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["profile-courts", mode],
    queryFn: () => courtsApi.list(`${mode}=true&page_size=100`),
  });
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10 pb-24">
        <p className="text-xs font-bold uppercase tracking-widest text-orange">
          Профиль
        </p>
        <h1 className="display mt-2 text-3xl">{title}</h1>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {isLoading ? (
            <p>Загрузка…</p>
          ) : data?.results.length ? (
            data.results.map((c) => <CourtCard key={c.id} court={c} />)
          ) : (
            <p className="text-muted">Здесь пока пусто.</p>
          )}
        </div>
      </main>
      <MobileNav />
    </>
  );
}
