// Custom events for pub/sub dialogue system

export type ToastType = 'success' | 'error' | 'info';

export interface ToastEventDetail {
  id: string;
  message: string;
  type: ToastType;
}

export interface ConfirmEventDetail {
  message: string;
  title?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Emits an event that the DialogProvider will listen to
export const showToast = (message: string, type: ToastType = 'info') => {
  const event = new CustomEvent<ToastEventDetail>('app:toast', {
    detail: {
      id: Math.random().toString(36).substring(2, 9),
      message,
      type
    }
  });
  window.dispatchEvent(event);
};

// Returns a Promise that resolves to true or false
export const showConfirm = (message: string, title?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const event = new CustomEvent<ConfirmEventDetail>('app:confirm', {
      detail: {
        message,
        title,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      }
    });
    window.dispatchEvent(event);
  });
};
