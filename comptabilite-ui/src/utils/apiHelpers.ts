export const getApiErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err !== 'object' || err === null) return fallback;
  const e = err as {
    response?: { data?: unknown };
    message?: unknown;
  };

  const data = e.response?.data;
  if (typeof data === 'string' && data.trim().length > 0) return data;
  if (typeof data === 'object' && data !== null) {
    const maybeError = (data as { error?: unknown; message?: unknown }).error;
    const maybeMessage = (data as { error?: unknown; message?: unknown }).message;
    const msg = typeof maybeError === 'string' && maybeError.length > 0 ? maybeError : maybeMessage;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }

  const msg = e.message;
  return typeof msg === 'string' && msg.length > 0 ? msg : fallback;
};

export const downloadBlob = (
  data: unknown,
  filename: string,
  mimeType: string = 'application/octet-stream'
) => {
  const isValid =
    data instanceof Blob ||
    typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data);
  if (!isValid) return;

  const blob =
    data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
