import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_WEB_ID);

export async function verifyGoogleToken(
  idToken: string,
): Promise<TokenPayload> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_WEB_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throwError(
      HttpStatus.BAD_REQUEST,
      'Invalid Google ID token',
      'Invalid Google ID token: payload not found',
      'INVALID_GOOGLE_ID_TOKEN',
    );
  }
  return payload;
}
