"use client";

import Image from "next/image";
import Link from "next/link";
import { Lightbulb, MapPin, Star } from "lucide-react";
import type { Court } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Card } from "./ui";

const conditions: Record<string, string> = {
  excellent: "Отличное",
  good: "Хорошее",
  fair: "Нормальное",
  poor: "Повреждена",
  unknown: "Нужна проверка",
};

export function CourtCard({
  court,
  compact = false,
  onClick,
  className,
}: {
  court: Court;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const photo = court.photos[0]?.thumbnail || court.photos[0]?.image;
  return (
    <Card
      className={cn(
        "overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
      onClick={onClick}
    >
      {photo && !compact && (
        <div className="relative h-40">
          <Image src={photo} alt={court.name} fill className="object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/courts/${court.slug}`}
              className="font-bold hover:text-orange"
            >
              {court.name}
            </Link>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted">
              <MapPin size={13} />
              {court.address}
            </p>
          </div>
          {court.average_rating && (
            <span className="flex items-center gap-1 text-sm font-bold">
              <Star size={14} className="fill-warning text-warning" />
              {court.average_rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
              <Lightbulb size={12} /> свет
            </Badge>
          )}
          {court.distance_m != null && (
            <Badge>
              {court.distance_m < 1000
                ? `${court.distance_m} м`
                : `${(court.distance_m / 1000).toFixed(1)} км`}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
