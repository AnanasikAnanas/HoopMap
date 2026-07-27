"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CircleDot,
  Lightbulb,
  MapPin,
  Navigation,
  Star,
} from "lucide-react";
import type { Court } from "@/lib/types";
import { Badge } from "@/components/ui";

const conditions: Record<string, string> = {
  excellent: "Отличное состояние",
  good: "Хорошее состояние",
  fair: "Нормальное состояние",
  poor: "Требует ремонта",
  unknown: "Нужна проверка",
};

function formatDistance(distance?: number | null) {
  if (distance == null) return null;
  return distance < 1000
    ? `${Math.round(distance)} м`
    : `${(distance / 1000).toFixed(1)} км`;
}

export function MapCourtSheet({ court }: { court: Court }) {
  const photo = court.photos[0]?.thumbnail || court.photos[0]?.image;
  const routeUrl = `https://yandex.ru/maps/?rtext=~${court.location.lat}%2C${court.location.lon}&rtt=auto`;
  const distance = formatDistance(court.distance_m);

  return (
    <article className="px-2 pb-2">
      <div className="flex gap-3">
        {photo ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-canvas">
            <Image
              src={photo}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="court-thumbnail-placeholder grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-dark text-orange">
            <CircleDot size={28} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-orange">
                Баскетбольная площадка
              </p>
              <h2 className="mt-1 line-clamp-2 text-lg font-extrabold leading-tight">
                {court.name}
              </h2>
            </div>
            {court.average_rating != null && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-xs font-extrabold">
                <Star size={13} className="fill-warning text-warning" />
                {court.average_rating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-4 text-muted">
            <MapPin size={14} className="mt-0.5 shrink-0 text-orange" />
            <span className="line-clamp-2">{court.address}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge
          className={
            court.condition === "poor"
              ? "bg-danger/10 text-danger"
              : "bg-success/10 text-success"
          }
        >
          {conditions[court.condition] ?? court.condition}
        </Badge>
        <Badge>{court.hoops_count} кольца</Badge>
        {court.has_lighting && (
          <Badge>
            <Lightbulb size={12} />
            Освещение
          </Badge>
        )}
        {distance && <Badge>{distance}</Badge>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={routeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-orange px-4 text-sm font-extrabold text-white transition hover:bg-[#d95822] active:scale-[0.98]"
        >
          <Navigation size={17} />
          Маршрут
        </a>
        <Link
          href={`/courts/${court.slug}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-canvas px-4 text-sm font-extrabold text-ink transition hover:border-orange hover:text-orange active:scale-[0.98]"
        >
          Подробнее
          <ArrowRight size={17} />
        </Link>
      </div>
    </article>
  );
}
