import { OAuth2Client, TokenPayload } from 'google-auth-library';

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
    throw new Error('Invalid Google ID token: payload not found');
  }
  return payload;
}
