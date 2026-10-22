<script lang="ts">
    import type DailyNoteViewPlugin from "../dailyNoteViewIndex";
    import { TFile, WorkspaceLeaf, moment } from "obsidian";
    import { createDailyNote } from "obsidian-daily-notes-interface";
    import DailyNote from "./DailyNote.svelte";
    import { inview } from "svelte-inview";
    import type { StreamEntry } from "../utils/journalStreamIndex";
    import { streamDocTitle, streamDocType } from "../utils/journalStreamIndex";
    import { typeHue } from "../utils/typeHue";

    export let entry: StreamEntry;
    export let plugin: DailyNoteViewPlugin;
    export let leaf: WorkspaceLeaf;
    export let readerMode: boolean = false;

    let noteInview = false;
    // Journal entries mount their editors lazily like the daily note
    let journalInview: Record<string, boolean> = {};
    let creating = false;

    async function handleDateHeaderClick() {
        if (entry.dailyNote) {
            if (leaf && !(leaf as any)?.pinned) leaf.openFile(entry.dailyNote);
            else plugin.app.workspace.getLeaf(false).openFile(entry.dailyNote);
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
    <span role="link" class="stream-date-link" title={entry.dailyNote ? "Open daily note" : "Create daily note for this date"} on:click={handleDateHeaderClick}>{entry.date}</span>
</div>
{#if entry.dailyNote}
    <div use:inview={{
        rootMargin: "80%",
        unobserveOnEnter: false,
        root: leaf.view.contentEl
    }} on:inview_change={({ detail }) => (noteInview = detail.inView)}>
        <DailyNote file={entry.dailyNote} plugin={plugin} leaf={leaf} shouldRender={noteInview} readerMode={readerMode} hideTitle={true} />
    </div>
{/if}
{#if entry.journals.length > 0}
    {#each entry.journals as group (group.name)}
        <div class="stream-journal" style="--js-h: {typeHue(group.name)}">
            <div class="stream-journal-caption">{group.name}</div>
            <div class="stream-journal-body">
                {#each group.files as file (file.path)}
                    <div use:inview={{
                        rootMargin: "80%",
                        unobserveOnEnter: false,
                        root: leaf.view.contentEl
                    }} on:inview_change={({ detail }) => {
                        journalInview[file.path] = detail.inView;
                        journalInview = journalInview;
                    }}>
                        <DailyNote file={file} plugin={plugin} leaf={leaf} shouldRender={journalInview[file.path] ?? false} readerMode={readerMode} />
                    </div>
                {/each}
            </div>
        </div>
    {/each}
{/if}
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

<style>
    .daily-note-title {
        display: flex;
        align-items: center;
        gap: var(--size-4-2);
        margin-top: var(--size-4-8);
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
        display: flex;
        align-items: flex-start;
        border-left: 3px solid hsl(var(--js-h) 65% 55%);
        margin: 0 0 var(--size-4-8);
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
        margin-left: var(--size-4-3);
        flex: 1;
        min-width: 0;
    }
</style>
