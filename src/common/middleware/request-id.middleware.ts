import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.header('x-request-id');
  const requestId = (incoming && incoming.trim()) || randomUUID();

  (req as Request & { requestId: string }).requestId = requestId;

  res.setHeader('x-request-id', requestId);

  next();
}
