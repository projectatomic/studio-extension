<script lang="ts">
import { inferenceServers } from '/@/stores/inferenceServers';
import ServiceStatus from '/@/lib/table/service/ServiceStatus.svelte';
import ServiceAction from '/@/lib/table/service/ServiceAction.svelte';
import Fa from 'svelte-fa';
import {
  faArrowUpRightFromSquare,
  faBuildingColumns,
  faCheck,
  faCopy,
  faFan,
  faMicrochip,
  faScaleBalanced,
} from '@fortawesome/free-solid-svg-icons';
import { type InferenceServer, InferenceType } from '@shared/src/models/IInference';
import { snippetLanguages } from '/@/stores/snippetLanguages';
import type { LanguageVariant } from 'postman-code-generators';
import { studioClient } from '/@/utils/client';
import { onMount } from 'svelte';
import { router } from 'tinro';
import { Button, DetailsPage, Tooltip, Link } from '@podman-desktop/ui-svelte';
import CopyButton from '/@/lib/button/CopyButton.svelte';
import type { RequestOptions } from '@shared/src/models/RequestOptions';
import { filesize } from 'filesize';
import MonacoEditor from '/@/lib/monaco-editor/MonacoEditor.svelte';

export let containerId: string | undefined = undefined;

let service: InferenceServer | undefined = undefined;

let selectedLanguage: string = 'curl';
$: selectedLanguage;

let variants: LanguageVariant[] = [];
$: variants = $snippetLanguages.find(language => language.key === selectedLanguage)?.variants ?? [];

let selectedVariant: string = 'cURL';
$: selectedVariant;

const onLanguageChange = (): void => {
  if (variants.length > 0) {
    selectedVariant = variants[0].key;
    generate(selectedLanguage, selectedVariant).catch(err =>
      console.error(`Error generating snippet for language ${selectedLanguage} variant ${selectedVariant}:`, err),
    );
  }
};

let snippet: string | undefined = undefined;
$: snippet;

const generate = async (language: string, variant: string): Promise<void> => {
  copied = false;

  let options: RequestOptions | undefined;
  switch (service?.type) {
    case InferenceType.LLAMA_CPP:
      options = {
        url: `http://localhost:${service?.connection.port || '??'}/v1/chat/completions`,
        method: 'POST',
        header: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
        body: {
          mode: 'raw',
          raw: `{
  "messages": [
    {
      "content": "You are a helpful assistant.",
      "role": "system"
    },
    {
      "content": "What is the capital of France?",
      "role": "user"
    }
  ]
}`,
        },
      };
      break;
    case InferenceType.WHISPER_CPP:
      options = {
        url: `http://localhost:${service?.connection.port || '??'}/inference`,
        method: 'POST',
        header: [
          {
            key: 'Accept',
            value: 'application/json',
          },
        ],
        body: {
          mode: 'formdata',
          formdata: [
            {
              key: 'file',
              value: './local.mp3',
              type: 'file',
            },
          ],
        },
      };
      break;
  }

  if (!options) return;

  try {
    snippet = await studioClient.createSnippet(options, language, variant);
  } catch (err: unknown) {
    snippet = `${String(err)}`;
  }
};

$: {
  if (!snippet && service) {
    generate('curl', 'cURL').catch(err =>
      console.error(`Error generating snippet for language curl variant cURL:`, err),
    );
  }
}

let copied: boolean = false;
function copySnippet(): void {
  if (!snippet) return;

  studioClient
    .copyToClipboard(snippet)
    .then(() => {
      copied = true;
      studioClient
        .telemetryLogUsage('snippet.copy', {
          cpyButton: true,
          language: selectedLanguage,
          variant: selectedVariant,
        })
        .catch(err => console.error(`Error reporting telemetry:`, err));
    })
    .catch((err: unknown) => {
      console.error('Something went wrong while trying to copy language snippet.', err);
    });
}

onMount(() => {
  return inferenceServers.subscribe(servers => {
    service = servers.find(server => server.container.containerId === containerId);
    if (!service) {
      router.goto('/services');
    }
  });
});

export function goToUpPage(): void {
  router.goto('/services');
}

function openLink(url: string): void {
  studioClient.openURL(url).catch(err => console.error(`Error opening URL: ${url}`, err));
}

function handleOnChange(): void {
  generate(selectedLanguage, selectedVariant).catch(err =>
    console.log(`Error generating language=${selectedLanguage} variant=${selectedVariant}`, err),
  );
}
</script>

<DetailsPage
  title="Service details"
  breadcrumbLeftPart="Model Services"
  breadcrumbRightPart="Service details"
  breadcrumbTitle="Go back to Model Services"
  onclose={goToUpPage}
  onbreadcrumbClick={goToUpPage}>
  <svelte:fragment slot="icon">
    <div class="mr-3">
      {#if service !== undefined}
        <ServiceStatus object={service} />
      {/if}
    </div>
  </svelte:fragment>
  <svelte:fragment slot="subtitle">
    <div class="flex gap-x-2 items-center text-[var(--pd-content-sub-header)]">
      {#if service}
        <span class="text-xs">{service.container.containerId}</span>
      {/if}
    </div>
  </svelte:fragment>
  <svelte:fragment slot="actions">
    {#if service !== undefined}
      <ServiceAction detailed object={service} />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="content">
    <div class="h-full overflow-y-auto bg-[var(--pd-content-bg)]">
      <div class="flex flex-col min-w-full min-h-full">
        <div class="min-w-full min-h-full flex-1">
          <div class="mt-4 px-5 space-y-5">
            {#if service !== undefined}
              <!-- Inference Server -->
              <div>
                <!-- title -->
                <div class="flex flex-row">
                  <span class="text-base grow text-[var(--pd-content-card-text)]">Inference Server</span>
                </div>

                <!-- inference server details content -->
                <div class="bg-[var(--pd-content-card-bg)] rounded-md w-full px-4 pt-3 pb-4 mt-2 flex flex-col gap-y-4">
                  <!-- endpoint URL -->
                  {#if service.status === 'running'}
                    <div class="flex flex-col gap-y-2">
                      <span class="text-sm text-[var(--pd-content-card-text)]">Inference Endpoint URL</span>
                      <div class="flex items-center gap-x-4" aria-label="Endpoint URL">
                        <!-- API URL -->
                        {#if 'api' in service.labels}
                          <CopyButton
                            top
                            class="bg-[var(--pd-label-bg)] text-[var(--pd-label-text)] rounded-md p-2 flex flex-row w-min h-min text-xs text-nowrap items-center"
                            content={service.labels['api']}>
                            {service.labels['api']}
                            <Fa class="ml-2" icon={faCopy} />
                          </CopyButton>
                        {/if}

                        <!-- Documentation URL -->
                        <div class="grow text-[var(--pd-label-text)]">
                          {#if 'docs' in service.labels}
                            Access
                            <Tooltip tip="Open swagger documentation">
                              <Link
                                aria-label="swagger documentation"
                                on:click={openLink.bind(undefined, service.labels['docs'])}>
                                swagger documentation
                              </Link>
                            </Tooltip>
                          {/if}
                        </div>

                        {#if 'gpu' in service.labels}
                          <Tooltip left tip={service.labels['gpu']}>
                            <div
                              class="bg-[var(--pd-label-bg)] text-[var(--pd-label-text)] rounded-md p-2 flex flex-row w-min h-min text-xs text-nowrap items-center"
                              aria-label="Inference Type">
                              GPU Inference
                              <Fa spin={service.status === 'running'} class="ml-2" icon={faFan} />
                            </div>
                          </Tooltip>
                        {:else}
                          <div
                            class="bg-[var(--pd-label-bg)] text-[var(--pd-label-text)] rounded-md p-2 flex flex-row w-min h-min text-xs text-nowrap items-center"
                            aria-label="Inference Type">
                            CPU Inference
                            <Fa class="ml-2" icon={faMicrochip} />
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  <!-- models -->
                  <div class="flex flex-col gap-y-2">
                    <span class="text-sm text-[var(--pd-content-card-text)]">
                      {service.models.length > 1 ? 'Models' : 'Model'}
                    </span>
                    <div>
                      {#each service.models as model}
                        <div>
                          <div
                            class="w-full bg-[var(--pd-label-bg)] text-[var(--pd-label-text)] rounded-md px-2 py-1 flex flex-col gap-y-4">
                            <div class="flex flex-row gap-2 items-center">
                              <div class="grow text-sm" aria-label="Model name">
                                <a href="/model/{model.id}" class="flex items-center">
                                  {model.name}
                                  <Fa class="ml-2" icon={faArrowUpRightFromSquare} />
                                </a>
                              </div>
                              <div>
                                <div
                                  class="bg-[var(--pd-content-card-bg)] rounded-md px-2 py-1 flex flex-row w-min h-min text-xs text-charcoal-100 text-nowrap items-center">
                                  <Fa class="mr-2" icon={faScaleBalanced} />
                                  {model.license}
                                </div>
                              </div>
                              <div>
                                <div
                                  class="bg-[var(--pd-content-card-bg)] rounded-md px-2 py-1 flex flex-row w-min h-min text-xs text-charcoal-100 text-nowrap items-center">
                                  <Fa class="mr-2" icon={faBuildingColumns} />
                                  {model.registry}
                                </div>
                              </div>
                            </div>
                          </div>

                          <table class="w-full text-[var(--pd-label-text)] ml-4 mt-2">
                            <tbody>
                              {#if model.file?.size}
                                <tr>
                                  <td>Size</td>
                                  <td>{filesize(model.file.size)}</td>
                                </tr>
                              {/if}
                              {#if model.file}
                                <tr>
                                  <td>File path</td>
                                  <td>{model.file.path}</td>
                                </tr>
                              {/if}
                            </tbody>
                          </table>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>

              <!-- code client -->
              <div>
                <div class="flex flex-row items-center">
                  <span class="text-base grow text-[var(--pd-content-card-text)]">Client code</span>

                  <!-- language choice -->
                  <select
                    required
                    aria-label="snippet language selection"
                    bind:value={selectedLanguage}
                    on:change={onLanguageChange}
                    id="languages"
                    class="border ml-1 text-sm rounded-lg bg-[var(--pd-action-button-details-bg)] block p-1 border-[var(--pd-action-button-details-bg)] placeholder-gray-700 text-[var(--pd-action-button-details-text)]"
                    name="languages">
                    {#each $snippetLanguages as language}
                      <option class="my-1" value={language.key}>{language.label}</option>
                    {/each}
                  </select>
                  {#if selectedVariant !== undefined}
                    <select
                      required
                      aria-label="snippet language variant"
                      id="variants"
                      bind:value={selectedVariant}
                      on:change={handleOnChange}
                      disabled={variants.length === 1}
                      class="border ml-1 text-sm rounded-lg bg-[var(--pd-action-button-details-bg)] block p-1 border-[var(--pd-action-button-details-bg)] placeholder-gray-700 text-[var(--pd-action-button-details-text)]"
                      name="variants">
                      {#each variants as variant}
                        <option class="my-1" value={variant.key}>{variant.key}</option>
                      {/each}
                    </select>
                  {/if}
                </div>

                {#if snippet !== undefined}
                  <div
                    class="bg-[var(--pd-details-empty-cmdline-bg)] text-[var(--pd-details-empty-cmdline-text)] rounded-md w-full p-4 mt-2 relative h-[400px]"
                    aria-label="Code Snippet">
                    {#key snippet}
                      <MonacoEditor class="h-full" readOnly content={snippet} language={selectedLanguage} />
                    {/key}
                    <div class="absolute right-4 top-4 z-10">
                      <Button icon={copied ? faCheck : faCopy} type="secondary" title="Copy" on:click={copySnippet} />
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </svelte:fragment>
</DetailsPage>
