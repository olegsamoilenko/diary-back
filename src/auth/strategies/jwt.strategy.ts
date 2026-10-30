import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import {
  assertCurrentUserAccess,
  UserAccessClaims,
} from '../user-access-claims';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly jwtSecret: string;

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
    this.jwtSecret = secret;
  }

  async validate(payload: UserAccessClaims) {
    const user =
      Number.isSafeInteger(payload.id) && payload.id > 0
        ? await this.users.findById(payload.id)
        : null;
    assertCurrentUserAccess(payload, user, this.jwtSecret);
    return {
      id: user.id,
      email: user.email,
      uuid: user.uuid,
      hash: user.hash,
      name: user.name,
    };
  }
}
