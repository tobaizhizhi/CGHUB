export function coboErrorMessage(e: unknown): string {
  const err = e as any;
  const status = err?.response?.status;
  const responseData = err?.response?.data;
  const message =
    err?.response?.data?.error?.reason ??
    err?.response?.data?.error?.message ??
    err?.response?.data?.error?.code ??
    err?.response?.data?.message ??
    err?.response?.data?.code ??
    err?.message;
  const normalized = typeof message === 'string' ? message.trim() : String(message ?? '').trim();
  const fallback = (() => {
    if (responseData !== undefined) {
      try {
        const serialized = JSON.stringify(responseData);
        if (serialized && serialized !== '{}') return serialized;
      } catch {
        // Fall through to the generic error serialization.
      }
    }
    try {
      const serialized = JSON.stringify(e);
      return serialized && serialized !== '{}' ? serialized : 'Unknown Cobo error';
    } catch {
      return String(e) || 'Unknown Cobo error';
    }
  })();
  const isGenericAxiosMessage = /^Request failed with status code \d+$/i.test(normalized);
  const text = normalized && !isGenericAxiosMessage ? normalized : fallback;
  return status ? `Cobo API ${status}: ${text}` : text;
}

export function isPolicyDenied(e: unknown): boolean {
  const err = e as any;
  const payload = JSON.stringify(err?.response?.data ?? {});
  return /deny|denied|policy|403|amount_gt/i.test(`${payload} ${err?.message ?? ''}`);
}
