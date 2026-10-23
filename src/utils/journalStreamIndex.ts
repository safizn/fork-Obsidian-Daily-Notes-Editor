import { App, TFile, moment } from "obsidian";
import { TimeRange } from "../types/time";
import { isMomentInRange } from "./timeRange";

export interface JournalSource {
    folder: string;
    form: "journal" | "document";
}

/* A journal registered in the Obsidian Journals plugin */
export interface RegisteredJournal {
    name: string;
    folder: string;
}

export interface StreamJournalGroup {
    /* Journal display name (Journals-plugin name, or folder basename) */
    name: string;
    files: TFile[];
}

export interface StreamEntry {
    /* ISO date key (YYYY-MM-DD) the entry is filed under */
    date: string;
    /* Embedded journal entries, grouped per journal in registration order */
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

const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.md$/;

/* Created-date index over the configured sources and registered
 * journals. All data comes from metadataCache and the vault file list
 * (no disk reads), so a full rebuild is cheap and every vault/metadata
 * event rebuilds instead of polling. A file under nested sources
 * belongs to the most specific (longest) matching folder. */
export class JournalStreamIndex {
    private app: App;
    private sources: JournalSource[];
    private journals: RegisteredJournal[] = [];
    private journalFilesByDate = new Map<
        string,
        Array<{ name: string; file: TFile }>
    >();
    private docFilesByDate = new Map<string, TFile[]>();

    constructor(app: App, sources: JournalSource[]) {
        this.app = app;
        this.sources = sources;
    }

    setSources(sources: JournalSource[]): void {
        this.sources = sources;
    }

    setJournals(journals: RegisteredJournal[]): void {
        this.journals = journals;
    }

    matchesSource(file: TFile): boolean {
        return this.matchSource(file) !== null;
    }

    rebuild(): void {
        this.journalFilesByDate = new Map();
        this.docFilesByDate = new Map();

        const journalFolders = new Map<string, string>(); // folder -> name
        for (const journal of this.journals) {
            if (journal.folder) {
                journalFolders.set(journal.folder.replace(/\/+$/, ""), journal.name);
            }
        }

        for (const file of this.app.vault.getMarkdownFiles()) {
            const parentPath = file.parent?.path ?? "/";

            const journalName = journalFolders.get(parentPath);
            if (journalName) {
                if (!DATE_FILE.test(file.name)) continue;
                const files = this.journalFilesByDate.get(file.basename);
                if (files) files.push({ name: journalName, file });
                else this.journalFilesByDate.set(file.basename, [{ name: journalName, file }]);
                continue;
            }

            const source = this.matchSource(file);
            if (!source) continue;
            const created = this.createdDateOf(file);
            if (!created) continue;

            if (source.form === "journal") {
                const files = this.journalFilesByDate.get(created);
                if (files) files.push({ name: basename(source.folder), file });
                else this.journalFilesByDate.set(created, [{ name: basename(source.folder), file }]);
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
        customRange: { start: Date; end: Date } | null,
        hiddenJournals: Set<string> = new Set()
    ): StreamEntry[] {
        const now = moment();
        const byDate = new Map<string, StreamEntry>();

        const entryOf = (date: string): StreamEntry => {
            let entry = byDate.get(date);
            if (!entry) {
                entry = { date, journals: [], docs: [] };
                byDate.set(date, entry);
            }
            return entry;
        };

        // registered journals first (registration order), then journal-form
        // sources — both grouped by name, hidden journals skipped
        for (const [date, journalFiles] of this.journalFilesByDate) {
            const groups = new Map<string, TFile[]>();
            for (const item of journalFiles) {
                if (hiddenJournals.has(item.name)) continue;
                const files = groups.get(item.name);
                if (files) files.push(item.file);
                else groups.set(item.name, [item.file]);
            }
            if (groups.size === 0) continue;
            const entry = entryOf(date);
            for (const [name, files] of groups) {
                files.sort((a, b) => a.basename.localeCompare(b.basename));
                entry.journals.push({ name, files });
            }
        }

        // hiding a journal hides its whole bundle: activities under the
        // journal's bundle root go with it
        const hiddenRoots = this.journals
            .filter((journal) => hiddenJournals.has(journal.name))
            .map((journal) => journal.folder.replace(/\/journal$/, ""))
            .filter((root) => root.length > 0);

        for (const [date, files] of this.docFilesByDate) {
            const docs = files.filter(
                (file) =>
                    !hiddenRoots.some(
                        (root) =>
                            file.path === root || file.path.startsWith(root + "/")
                    )
            );
            if (docs.length > 0) entryOf(date).docs = docs;
        }

        const entries = [...byDate.values()].filter((entry) =>
            entry.journals.length > 0 || entry.docs.length > 0
        );
        const filtered = entries.filter((entry) =>
            isMomentInRange(
                moment(entry.date, "YYYY-MM-DD"),
                now,
                timeRange,
                customRange
            )
        );
        filtered.sort((a, b) => b.date.localeCompare(a.date));
        return filtered;
    }

    /* Every date carrying content (journal entry or activity), newest
     * first — the day view's prev/next landing dates */
    allDates(): string[] {
        const dates = new Set<string>(this.journalFilesByDate.keys());
        for (const date of this.docFilesByDate.keys()) dates.add(date);
        return [...dates].sort((a, b) => b.localeCompare(a));
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
