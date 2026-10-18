<script lang="ts">
    import type DailyNoteViewPlugin from "../dailyNoteViewIndex";
    import { TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
    import { spawnLeafView } from "../leafView";
    import { onDestroy, onMount } from "svelte";

    export let file: TAbstractFile;
    export let plugin: DailyNoteViewPlugin;
    export let leaf: WorkspaceLeaf;
    export let shouldRender: boolean = true;
    export let readerMode: boolean = false;

    let editorEl: HTMLElement;
    let containerEl: HTMLElement;
    let title: string;

    let rendered: boolean = false;

    let createdLeaf: WorkspaceLeaf;
    let unloadTimeout: number | null = null;
    let heightObserver: ResizeObserver | null = null;
    let editorHeight: number = 100; // Default minimum height
    
    // Track if this component is being destroyed
    let isDestroying = false;
    
    // Track if the note is collapsed
    let isCollapsed: boolean = false;

    onMount(() => {
        if (file instanceof TFile) {
            title = file.basename;
        }
    });

    $: if (editorEl && shouldRender && !rendered) {
        showEditor();
    } else if (editorEl && !shouldRender && rendered) {
        scheduleUnload();
    }

    onDestroy(() => {
        isDestroying = true;
        if (unloadTimeout) {
            window.clearTimeout(unloadTimeout);
        }
        heightObserver?.disconnect();
        heightObserver = null;
        if (rendered && createdLeaf) {
            unloadEditor();
        }
    });

    function showEditor() {
        if (!(file instanceof TFile)) return;
        if (rendered) return;
        if (isDestroying) return;
        
        // Clear any pending unload
        if (unloadTimeout) {
            window.clearTimeout(unloadTimeout);
            unloadTimeout = null;
        }

        try {
            // Use safe type checking before accessing basename
            const fileName = file instanceof TFile ? file.basename : "unknown";
            console.log(`Loading editor for ${fileName}`);
            
            [createdLeaf] = spawnLeafView(plugin, editorEl, leaf);
            createdLeaf.setPinned(true);

            createdLeaf.setViewState({
                type: "markdown",
                state: {
                    file: file.path,
                    mode: readerMode ? "preview" : "source",
                    source: false,
                    backlinks: !plugin.settings.hideBacklinks,
                    backlinkOpts: {
                        collapseAll: false,
                        extraContext: false,
                        sortOrder: "alphabetical",
                        showSearch: false,
                        searchQuery: "",
                        backlinkCollapsed: false,
                        unlinkedCollapsed: true
                    }
                }
            });
            createdLeaf.parentLeaf = leaf;

            rendered = true;

            // Track the editor's live height so the reserved min-height stays
            // correct for async content (embeds, images) that grows after paint
            heightObserver = new ResizeObserver(() => {
                if (!rendered || isDestroying || !editorEl) return;
                const h = Math.ceil(editorEl.getBoundingClientRect().height);
                if (h > 0) editorHeight = h;
            });
            heightObserver.observe(editorEl);
        } catch (error) {
            console.error("Error creating leaf view:", error);
        }
    }
    
    // Schedule unloading the editor with a delay to prevent flickering
    function scheduleUnload() {
        if (unloadTimeout) {
            window.clearTimeout(unloadTimeout);
        }
        
        // Use a longer timeout to prevent frequent load/unload cycles
        unloadTimeout = window.setTimeout(() => {
            if (!shouldRender && rendered) {
                unloadEditor();
            }
        }, 1000);
    }
    
    // Unload the editor to free up resources
    function unloadEditor() {
        if (!rendered || !createdLeaf) return;

        try {
            heightObserver?.disconnect();
            heightObserver = null;

            // Pin the live wrapper height before detach collapses the content,
            // so unloading causes zero layout shift (no scroll jump / flicker)
            if (containerEl && !isCollapsed) {
                const h = Math.ceil(containerEl.getBoundingClientRect().height);
                if (h > 0) editorHeight = h;
            }

            // Detach the leaf
            if (createdLeaf.detach) {
                createdLeaf.detach();
            }

            // Clear the editor element
            if (editorEl) {
                editorEl.empty();
            }

            rendered = false;
        } catch (error) {
            console.error("Error unloading editor:", error);
        }
    }

    function handleFileIconClick() {
        if (!(file instanceof TFile)) return;
        if (leaf && !(leaf as any)?.pinned) {
            leaf.openFile(file);
        } else plugin.app.workspace.getLeaf(false).openFile(file);
    }

    function handleEditorClick() {
        if (readerMode) return;
        // @ts-ignore
        const editor = createdLeaf?.view?.editMode?.editor;
        if (editor && !editor.hasFocus()) {
            editor.focus();
        }
    }
    
    // Toggle collapse/expand state
    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }
</script>

<div class="daily-note-container" data-id='dn-editor-{file.path}' bind:this={containerEl} style="min-height: {isCollapsed ? 'auto' : editorHeight + 'px'};">
    <div class="daily-note">
        {#if title}
            <div class="daily-note-title inline-title">
                <!-- svelte-ignore a11y-interactive-supports-focus -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <span role="link" class="clickable-link" on:click={handleFileIconClick} data-title={title}>{title}</span>
                <!-- Collapse/Expand button -->
                <!-- svelte-ignore a11y-interactive-supports-focus -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <span role="button" data-collapsed={isCollapsed} class="collapse-button" on:click={toggleCollapse} title={isCollapsed ? "Expand" : "Collapse"}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>
                </span>
            </div>
        {/if}
        <div class="daily-note-editor" data-collapsed={isCollapsed} aria-hidden="true" bind:this={editorEl} data-title={title} on:click={handleEditorClick}>
            {#if !rendered && shouldRender}
                <div class="editor-placeholder">Loading...</div>
            {/if}
            {#if !shouldRender && !rendered}
                <div class="editor-placeholder">Scroll to view content</div>
            {/if}
        </div>
    </div>
</div>

<style>
    .daily-note {
        margin-bottom: var(--size-4-12);
        padding-bottom: var(--size-4-8);
    }

    .daily-note:has(.daily-note-editor[data-collapsed="true"]) {
        margin-bottom: 0;
        padding-bottom: 0;
    }

    .daily-note-editor {
        min-height: 100px;
    }

    .daily-note-editor[data-collapsed="true"] {
        display: none;
    }

    .daily-note .collapse-button {
        display: none;
    }

    .daily-note:hover .collapse-button {
        display: block;
    }

    .daily-note .collapse-button {
        color: var(--text-muted);
    }

    .daily-note .collapse-button:hover  {
        color: var(--text-normal);
    }

    .daily-note-title::before,
    .daily-note-title::after {
        content: "";
        height: 1px;
        background-color: color-mix(in srgb, var(--text-faint) 50%, transparent);
    }

    .daily-note-title::before {
        flex: 0 0 40px;
    }

    .daily-note-title::after {
        flex: 1;
    }

    .daily-note:has(.is-readable-line-width) .daily-note-title {
        max-width: calc(var(--file-line-width) + var(--size-4-4));
        width: calc(var(--file-line-width) + var(--size-4-4));
        margin-left: auto;
        margin-right: auto;
        margin-bottom: var(--size-4-8);
        display: flex;
        align-items: center;
        justify-content: start;

        gap: var(--size-4-2);
    }

    .collapse-button[data-collapsed="true"] {
        transform: rotate(-90deg);

        transition: transform 0.2s ease;
    }

    .daily-note:not(:has(.is-readable-line-width)) .daily-note-title {
        display: flex;
        justify-content: start;
        align-items: center;
        width: 100%;
        margin-top: var(--size-4-8);

        gap: var(--size-4-2);
    }

    .clickable-link {
        color: var(--text-accent);
        cursor: pointer;
        text-decoration: none;
    }

    .clickable-link:hover {
        color: var(--color-accent);
        text-decoration: underline;
    }
    
    .editor-placeholder {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100px;
        color: var(--text-muted);
        font-style: italic;
    }
    
    .collapse-button {
        cursor: pointer;
        order: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        color: var(--text-muted);
        transition: background-color 0.2s ease;
    }
    
    .collapse-button:hover {
        /* background-color: var(--background-modifier-hover); */
        color: var(--text-normal);
    }
</style>
