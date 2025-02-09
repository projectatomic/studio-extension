<script lang="ts">
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import { router } from 'tinro';

interface Props {
  object: ModelInfo;
}

let { object }: Props = $props();

let hf: boolean = $state(object.properties?.['origin'] === 'HF_CACHE');

function openDetails(): void {
  router.goto(`/model/${object.id}`);
}
</script>

<button class="flex flex-col w-full" title={object.name} onclick={openDetails} aria-label="Open Model Details">
  <div
    class="text-[var(--pd-table-body-text-highlight)] overflow-hidden text-ellipsis w-full text-left"
    aria-label="Model Name">
    {object.name}
  </div>
  {#if object.registry ?? object.license}
    <span class="text-sm text-[var(--pd-table-body-text)]" aria-label="Model Info"
      >{object.registry} - {object.license}</span>
  {/if}
  {#if hf}
    <span class="text-sm text-[var(--pd-table-body-text)]" aria-label="Imported Model Info"
      >Loaded from hugging face cache</span>
  {:else if !object.registry && !object.license && !object.url}
    <span class="text-sm text-[var(--pd-table-body-text)]" aria-label="Imported Model Info">Imported by User</span>
  {/if}
</button>
