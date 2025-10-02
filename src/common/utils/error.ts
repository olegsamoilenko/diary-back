import { HttpException } from '@nestjs/common';

export default function throwError(
  statusCode: number,
  statusMessage: string,
  message: string,
  code?: string,
  data?: any,
): never {
  throw new HttpException(
    {
      statusCode,
      statusMessage,
      message,
      code,
      data,
    },
    statusCode,
  );
}
