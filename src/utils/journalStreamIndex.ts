import { App, TFile, moment } from "obsidian";
import {
    getAllDailyNotes,
    getDailyNoteSettings,
    DEFAULT_DAILY_NOTE_FORMAT,
} from "obsidian-daily-notes-interface";
import { TimeRange } from "../types/time";
import { isMomentInRange } from "./timeRange";

export interface JournalSource {
    folder: string;
    form: "journal" | "document";
}

export interface StreamJournalGroup {
    /* Source display name: folder basename */
    name: string;
    files: TFile[];
}

export interface StreamEntry {
    /* ISO date key (YYYY-MM-DD) the entry is filed under */
    date: string;
    dailyNote: TFile | null;
    /* Embedded journal entries, grouped per source in source-list order */
    journals: StreamJournalGroup[];
    /* Documents created that date, linked as activities */
    docs: TFile[];
}

/* Title and type are read live from metadataCache, never copied into the
 * index, so renamed retyped documents stay correct on rebuild. */
export function streamDocTitle(app: App, file: TFile): string {
    const title = app.metadataCache.getFileCache(file)?.frontmatter?.title;
    if (typeof title === "string" && title.trim()) return title.trim();
    return file.basename;
}

export function streamDocType(app: App, file: TFile): string | null {
    const type = app.metadataCache.getFileCache(file)?.frontmatter?.type;
    if (Array.isArray(type)) {
        const first = type.find(
            (value) => typeof value === "string" && value.trim()
        );
        return first ? first.trim() : null;
    }
    if (typeof type === "string" && type.trim()) return type.trim();
    return null;
}

/* Created-date index over the configured sources. All data comes from
 * metadataCache (no disk reads), so a full rebuild is cheap and every
 * vault/metadata event rebuilds instead of polling. A file under nested
 * sources belongs to the most specific (longest) matching folder. */
export class JournalStreamIndex {
    private app: App;
    private sources: JournalSource[];
    private journalFilesByDate = new Map<
        string,
        Array<{ folder: string; file: TFile }>
    >();
    private docFilesByDate = new Map<string, TFile[]>();

    constructor(app: App, sources: JournalSource[]) {
        this.app = app;
        this.sources = sources;
    }

    setSources(sources: JournalSource[]): void {
        this.sources = sources;
    }

    matchesSource(file: TFile): boolean {
        return this.matchSource(file) !== null;
    }

    rebuild(): void {
        this.journalFilesByDate = new Map();
        this.docFilesByDate = new Map();

        for (const file of this.app.vault.getMarkdownFiles()) {
            const source = this.matchSource(file);
            if (!source) continue;
            const created = this.createdDateOf(file);
            if (!created) continue;

            if (source.form === "journal") {
                const files = this.journalFilesByDate.get(created);
                if (files) files.push({ folder: source.folder, file });
                else this.journalFilesByDate.set(created, [{ folder: source.folder, file }]);
            } else {
                const files = this.docFilesByDate.get(created);
                if (files) files.push(file);
                else this.docFilesByDate.set(created, [file]);
            }
        }

        for (const files of this.docFilesByDate.values()) {
            files.sort((a, b) =>
                streamDocTitle(this.app, a).localeCompare(
                    streamDocTitle(this.app, b)
                )
            );
        }
    }

    getEntries(
        timeRange: TimeRange,
        customRange: { start: Date; end: Date } | null
    ): StreamEntry[] {
        const format =
            getDailyNoteSettings().format || DEFAULT_DAILY_NOTE_FORMAT;
        const now = moment();
        const byDate = new Map<string, StreamEntry>();

        for (const [key, dailyNote] of Object.entries(
            getAllDailyNotes()
        ) as [string, TFile][]) {
            const date = moment(key, format).format("YYYY-MM-DD");
            byDate.set(date, { date, dailyNote, journals: [], docs: [] });
        }

        for (const [date, journalFiles] of this.journalFilesByDate) {
            const entry = this.getOrCreateEntry(byDate, date);
            const byFolder = new Map<string, TFile[]>();
            for (const { folder, file } of journalFiles) {
                const files = byFolder.get(folder);
                if (files) files.push(file);
                else byFolder.set(folder, [file]);
            }
            for (const source of this.sources) {
                const files = byFolder.get(source.folder);
                if (!files) continue;
                files.sort((a, b) =>
                    streamDocTitle(this.app, a).localeCompare(
                        streamDocTitle(this.app, b)
                    )
                );
                entry.journals.push({
                    name: basename(source.folder),
                    files,
                });
            }
        }

        for (const [date, files] of this.docFilesByDate) {
            this.getOrCreateEntry(byDate, date).docs = files;
        }

        const entries = [...byDate.values()].filter((entry) =>
            isMomentInRange(
                moment(entry.date, "YYYY-MM-DD"),
                now,
                timeRange,
                customRange
            )
        );
        entries.sort((a, b) => b.date.localeCompare(a.date));
        return entries;
    }

    private getOrCreateEntry(
        byDate: Map<string, StreamEntry>,
        date: string
    ): StreamEntry {
        let entry = byDate.get(date);
        if (!entry) {
            entry = { date, dailyNote: null, journals: [], docs: [] };
            byDate.set(date, entry);
        }
        return entry;
    }

    private matchSource(file: TFile): JournalSource | null {
        const parentPath = file.parent?.path ?? "/";
        let best: JournalSource | null = null;
        for (const source of this.sources) {
            if (!source.folder) continue;
            if (
                parentPath === source.folder ||
                parentPath.startsWith(source.folder + "/")
            ) {
                if (!best || source.folder.length > best.folder.length) {
                    best = source;
                }
            }
        }
        return best;
    }

    private createdDateOf(file: TFile): string | null {
        const created =
            this.app.metadataCache.getFileCache(file)?.frontmatter?.created;
        if (typeof created !== "string") return null;
        const date = moment(created.trim(), "YYYY-MM-DD", true);
        return date.isValid() ? date.format("YYYY-MM-DD") : null;
    }
}

function basename(folder: string): string {
    const parts = folder.split("/").filter((part) => part.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : folder;
}
