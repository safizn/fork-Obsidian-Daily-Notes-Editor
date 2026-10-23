<script lang="ts">
    import type DailyNoteViewPlugin from "../dailyNoteViewIndex";
    import { TFile, WorkspaceLeaf, moment } from "obsidian";
    import { createDailyNote } from "obsidian-daily-notes-interface";
    import DailyNote from "./DailyNote.svelte";
    import { inview } from "svelte-inview";
    import type { StreamEntry } from "../utils/journalStreamIndex";
    import { streamDocTitle, streamDocType } from "../utils/journalStreamIndex";
    import { typeHue, paletteHue } from "../utils/typeHue";

    export let entry: StreamEntry;
    export let plugin: DailyNoteViewPlugin;
    export let leaf: WorkspaceLeaf;
    export let readerMode: boolean = false;

    // Journal entries mount their editors lazily like the daily note
    let journalInview: Record<string, boolean> = {};
    let creating = false;

    async function handleDateHeaderClick() {
        if (entry.journals.length > 0 || entry.docs.length > 0) {
            // the caption opens the day stream view, not one journal
            plugin.openDayJournal(entry.date);
            return;
        }
        if (creating) return;
        creating = true;
        try {
            await createDailyNote(moment(entry.date));
        } catch (error) {
            console.error("Error creating daily note:", error);
            creating = false;
        }
        // No local state update: the parent rebuilds on the vault create event
    }

    function handleDocClick(file: TFile) {
        if (leaf && !(leaf as any)?.pinned) leaf.openFile(file);
        else plugin.app.workspace.getLeaf(false).openFile(file);
    }

    // One palette slot per registered journal, by registration order —
    // name hashing collides (Daily Log and Insights shared a hue)
    function journalHue(name: string): number {
        const journals = plugin.registeredJournals || [];
        const index = journals.findIndex((journal) => journal.name === name);
        return index >= 0 ? paletteHue(index) : typeHue(name);
    }

    // clicking a journal's caption/border strip opens that journal's
    // entry for this date; clicks inside the entry body are ignored
    function handleJournalSectionClick(event: MouseEvent, files: TFile[]) {
        if ((event.target as HTMLElement).closest(".stream-journal-body")) return;
        const file = files[0];
        if (!file) return;
        if (leaf && !(leaf as any)?.pinned) leaf.openFile(file);
        else plugin.app.workspace.getLeaf(false).openFile(file);
    }

    // Reflect the hovered link in the OKF bundle navigator when present
    function previewInNavigator(path: string | null) {
        const nav = (plugin.app as any).plugins?.plugins?.[
            "okf-bundle-navigator"
        ];
        if (nav?.previewFile) nav.previewFile(path);
    }
</script>

<div class="daily-note-title stream-date-title">
    <!-- svelte-ignore a11y-interactive-supports-focus -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <span role="link" class="stream-date-link" title={entry.journals.length || entry.docs.length ? "Open day view" : "Create journal entry for this date"} on:click={handleDateHeaderClick}>{entry.date}</span>
</div>

{#if entry.docs.length > 0}
    <ul class="stream-doc-list">
        {#each entry.docs as doc (doc.path)}
            {@const docType = streamDocType(plugin.app, doc)}
            <li class="stream-doc">
                <!-- svelte-ignore a11y-interactive-supports-focus -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <span role="link" class="stream-doc-link" style={docType ? `--tb-h: ${typeHue(docType)}` : ""} on:click={() => handleDocClick(doc)} on:mouseenter={() => previewInNavigator(doc.path)} on:mouseleave={() => previewInNavigator(null)}>
                    <span class="stream-doc-label">{streamDocTitle(plugin.app, doc)}</span>
                    {#if docType}
                        <span class="dn-stream-chip">{docType}</span>
                    {/if}
                </span>
            </li>
        {/each}
    </ul>
{/if}

{#if entry.journals.length > 0}
    {#each entry.journals as group (group.name)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="stream-journal" style="--js-h: {journalHue(group.name)}" title="Open {group.name} — {entry.date}" on:click={(event) => handleJournalSectionClick(event, group.files)}>
            <div class="stream-journal-caption">{group.name}</div>
            <div class="stream-journal-body">
                {#each group.files as file (file.path)}
                    {@const typedEntry = streamDocType(plugin.app, file) === "Journal Entry"}
                    <div use:inview={{
                        rootMargin: "80%",
                        unobserveOnEnter: false,
                        root: leaf.view.contentEl
                    }} on:inview_change={({ detail }) => {
                        journalInview[file.path] = detail.inView;
                        journalInview = journalInview;
                    }}>
                        <DailyNote file={file} plugin={plugin} leaf={leaf} shouldRender={journalInview[file.path] ?? false} readerMode={readerMode} hideTitle={typedEntry} />
                    </div>
                {/each}
            </div>
        </div>
    {/each}
{/if}
<style>
    .daily-note-title {
        display: flex;
        align-items: center;
        gap: var(--size-4-2);
        margin-top: var(--size-4-8);
        margin-bottom: var(--size-4-2);
        /* escape the container's content inset — the rule runs to the
         * true side edges */
        margin-inline: calc(var(--size-4-4) * -1);
    }

    .daily-note-title::before,
    .daily-note-title::after {
        content: "";
        height: 1px;
        background-color: color-mix(in srgb, var(--text-faint) 50%, transparent);
    }

    .daily-note-title::before {
        flex: 1;
    }

    .daily-note-title::after {
        flex: 0 0 40px;
    }

    .stream-date-link {
        color: var(--text-muted);
        cursor: pointer;
    }

    .stream-date-link:hover {
        color: var(--text-normal);
    }

    .stream-journal {
        cursor: pointer;
        display: flex;
        align-items: flex-start;
        border-left: 4px solid hsl(var(--js-h) 65% 55%);
        margin: 0 0 var(--size-4-4);
        /* border flush with the page edges — zero inset */
        margin-inline: calc(var(--size-4-4) * -1);
    }

    /* Vertical caption running along the accent border, from the top */
    .stream-journal-caption {
        writing-mode: vertical-rl;
        font-size: 0.75em;
        letter-spacing: 0.06em;
        color: var(--text-faint);
        padding-top: var(--size-2-1);
    }

    .stream-journal-body {
        cursor: default;
        /* escaped inset + gap, so text keeps its line position */
        margin-left: calc(var(--size-4-4) + var(--size-4-3));
        margin-bottom: var(--size-4-2);
        flex: 1;
        min-width: 0;
    }

    /* the embedded note's own trailing spacing is dead weight inside a
     * section — the body margin above carries the separation */
    .stream-journal-body :global(.daily-note) {
        margin-bottom: 0;
        padding-bottom: 0;
    }
</style>
