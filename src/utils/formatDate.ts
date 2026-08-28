import { format } from "date-fns";
import { fr } from "date-fns/locale";

export function formatFrenchDateShort(date: Date): string {
  return format(date, "d MMMM yyyy", { locale: fr });
}

export function formatFrenchDateLong(date: Date): string {
  return format(date, "EEEE d MMMM yyyy", { locale: fr });
}
