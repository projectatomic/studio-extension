import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { Publisher } from '../Publisher';
import type { Webview } from '@podman-desktop/api';
import { Messages } from '@shared/Messages';

interface TestState {
  testData: string;
}

describe('Publisher', () => {
  let mockWebview: Webview;
  let publisher: Publisher<TestState>;
  let mockStateGetter: Mock<() => TestState>;

  beforeEach(() => {
    mockWebview = {
      postMessage: vi.fn().mockImplementation(() => Promise.resolve()),
    } as unknown as Webview;

    mockStateGetter = vi.fn().mockReturnValue({ testData: 'test' });
    publisher = new Publisher<TestState>(mockWebview, Messages.MSG_ASK_ERROR_STATE, mockStateGetter);
  });

  it('should successfully notify with state data', async () => {
    await publisher['notify']();

    expect(mockStateGetter).toHaveBeenCalled();
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      id: Messages.MSG_ASK_ERROR_STATE,
      body: { testData: 'test' },
    });
  });

  it('should handle postMessage rejection by re-throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Communication failed');
    (mockWebview.postMessage as Mock).mockRejectedValueOnce(error);

    await expect(publisher['notify']()).rejects.toThrow(error);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error publishing to'), error);

    consoleSpy.mockRestore();
  });

  it('should handle stateGetter errors by re-throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('State getter failed');
    mockStateGetter.mockImplementation(() => {
      throw error;
    });

    await expect(publisher['notify']()).rejects.toThrow(error);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error publishing to'), error);

    consoleSpy.mockRestore();
  });
});
