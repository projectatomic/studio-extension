// eslint-disable-next-line etc/no-commented-out-code
// podman-desktop-api.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

declare module '@podman-desktop/api' {
  export interface ContainerProviderConnection {
    name: string;
  }

  export interface QuickPickItem {
    label: string;
    description?: string;
  }

  export interface ContainerCreateOptions {
    readinessProbe?: {
      exec?: {
        command: string[];
      };
    };
  }

  export interface TelemetryLogger {
    logUsage(event: string, data?: Record<string, any>): void;
    logError(event: string, data?: Record<string, any>): void;
  }

  export interface Webview {
    postMessage(message: { id: string; body: any }): Promise<void>;
  }

  export const window: {
    showWarningMessage(message: string, ...choices: string[]): Promise<string | undefined>;
    showErrorMessage(message: string): Promise<string | undefined>;
    showQuickPick<T>(items: T[], options: { placeHolder?: string }): Promise<T | undefined>;
  };

  export const env: {
    openExternal(uri: Uri): Promise<boolean>;
    clipboard: { writeText(text: string): Promise<void> };
    createTelemetryLogger(): TelemetryLogger;
  };

  export class Uri {
    static parse(input: string): Uri;
    with(options: { scheme?: string; authority?: string }): Uri;
    static file(path: string): Uri;
  }

  export const navigation: {
    navigateToContainer(containerId: string): Promise<void>;
    navigateToPod(kind: string, name: string, engineId: string): Promise<void>;
    navigateToResources?(): Promise<void>;
    navigateToEditProviderContainerConnection?(connection: ContainerProviderConnection): Promise<void>;
  };

  export const containerEngine: {
    listPods(): Promise<{ Id: string; Name: string; engineId: string; kind: string }[]>;
  };

  export interface ExtensionContext {
    storagePath: string;
    extensionUri: Uri;
    subscriptions: { dispose(): void }[];
  }

  export interface WebviewPanel {
    webview: Webview;
    onDidChangeViewState(callback: (e: WebviewPanelOnDidChangeViewStateEvent) => void): void;
    visible: boolean;
  }

  export interface WebviewPanelOnDidChangeViewStateEvent {
    webviewPanel: WebviewPanel;
  }

  export const version: string;
}

// Also declare the global PodmanDesktopApi interface for legacy support
declare global {
  export interface PodmanDesktopApi {
    getState: () => any;
    postMessage: (msg: any) => void;
    setState: (newState: any) => void;
  }

  function acquirePodmanDesktopApi(): PodmanDesktopApi;
}

export { PodmanDesktopApi };
