<script lang="ts">
import type { IconDefinition } from '@fortawesome/free-regular-svg-icons';
import Fa from 'svelte-fa';

interface Props {
  icon?: IconDefinition;
  content: string;
  backgroundColor?: string;
  textColor?: string;
  className?: string;
}

let {
  icon = undefined,
  content,
  backgroundColor = 'bg-[var(--pd-label-bg)]',
  textColor = 'text-[var(--pd-label-text)]',
  className = '',
}: Props = $props();
</script>

<div
  class="{backgroundColor} {textColor} {className} rounded-md px-2 py-1 flex flex-row w-min h-min text-nowrap items-center text-sm">
  {#if icon}
    <Fa class="mr-2" icon={icon} />
  {/if}
  {content}
</div>
