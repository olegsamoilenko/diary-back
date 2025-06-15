import { HttpException } from '@nestjs/common';

export default function throwError(
  statusCode: number,
  statusMessage: string,
  message: string,
  data?: any,
) {
  throw new HttpException(
    {
      statusCode,
      statusMessage,
      message,
      data,
    },
    statusCode,
  );
}
