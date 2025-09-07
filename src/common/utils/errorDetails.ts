import { HttpException } from '@nestjs/common';

export const errorDetails = (error: unknown) => {
  let status: number | string | undefined = undefined;
  let statusMessage: string | undefined = undefined;
  let message: string = '';
  if (error instanceof HttpException) {
    const resp = error.getResponse();

    if (typeof resp === 'string') {
      message = resp;
    } else if (isRecord(resp)) {
      message = readMessage(resp) ?? message;
      statusMessage =
        readString(resp, 'statusMessage') ??
        readString(resp, 'error') ??
        statusMessage;
    }
    status = error.getStatus();
  } else {
    message = error instanceof Error ? error.message : 'Internal server error';
  }

  return { status, statusMessage, message };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function readString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}
function readMessage(obj: Record<string, unknown>): string | undefined {
  const v = obj['message'];
  if (typeof v === 'string') return v;
  if (Array.isArray(v))
    return v.filter((x) => typeof x === 'string').join('; ');
  return undefined;
}
