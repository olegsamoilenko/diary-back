import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your_secret_key',
    });
  }

  validate(payload: {
    id: number;
    email: string;
    uuid: string;
    hash: string;
    name: string;
  }) {
    return {
      id: payload.id,
      email: payload.email,
      uuid: payload.uuid,
      hash: payload.hash,
      name: payload.name,
    };
  }
}
