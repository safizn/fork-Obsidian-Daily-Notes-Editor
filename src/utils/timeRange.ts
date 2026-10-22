import { moment } from "obsidian";
import { TimeRange } from "../types/time";

/* Range predicate shared by file-based filtering (FileManager) and
 * timeline date filtering. */
export function isMomentInRange(
    fileDate: moment.Moment,
    now: moment.Moment,
    timeRange: TimeRange,
    customRange?: { start: Date; end: Date } | null
): boolean {
    switch (timeRange) {
        case "week":
            return fileDate.isSame(now, "week");
        case "month":
            return fileDate.isSame(now, "month");
        case "year":
            return fileDate.isSame(now, "year");
        case "last-week":
            return fileDate.isBetween(
                moment().subtract(1, "week").startOf("week"),
                moment().subtract(1, "week").endOf("week"),
                null,
                "[]"
            );
        case "last-month":
            return fileDate.isBetween(
                moment().subtract(1, "month").startOf("month"),
                moment().subtract(1, "month").endOf("month"),
                null,
                "[]"
            );
        case "last-year":
            return fileDate.isBetween(
                moment().subtract(1, "year").startOf("year"),
                moment().subtract(1, "year").endOf("year"),
                null,
                "[]"
            );
        case "quarter":
            return fileDate.isSame(now, "quarter");
        case "last-quarter":
            return fileDate.isBetween(
                moment().subtract(1, "quarter").startOf("quarter"),
                moment().subtract(1, "quarter").endOf("quarter"),
                null,
                "[]"
            );
        case "custom":
            if (customRange) {
                return fileDate.isBetween(
                    moment(customRange.start),
                    moment(customRange.end),
                    null,
                    "[]"
                );
            }
            return false;
        default:
            return true;
    }
}
