import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { env } from '../shared/env';
import { JwtPayload } from './types/jwt-payload';

const TOKEN_CONFIG_BY_TYPE = {
  access: {
    secret: env.JWT_ACCESS_SECRET,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  },
  refresh: {
    secret: env.JWT_REFRESH_SECRET,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
} as const;

type TokenType = keyof typeof TOKEN_CONFIG_BY_TYPE;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}
  async register(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const exists = await this.users.findByEmail(normalizedEmail);
    if (exists) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.createUser({
      email: normalizedEmail,
      passwordHash,
    });
    return this.issueTokensAndPersist(user);
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokensAndPersist(user);
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.refreshTokenHash)
      throw new UnauthorizedException('Invalid refresh');

    // Compare provided refresh token with stored hash
    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Invalid refresh');
    return this.issueTokensAndPersist(user);
  }

  async logout(userId: string) {
    await this.users.setRefreshTokenHash(userId, null);
    return { ok: true };
  }

  async verifyRefreshTokenAndGetUserId(refreshToken: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: TOKEN_CONFIG_BY_TYPE.refresh.secret,
      });
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private signToken(type: TokenType, payload: JwtPayload) {
    const config = TOKEN_CONFIG_BY_TYPE[type];
    return this.jwt.signAsync(payload, {
      secret: config.secret,
      expiresIn: config.expiresIn,
    });
  }

  private async issueTokens(userId: string, email: string) {
    const payload: JwtPayload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken('access', payload),
      this.signToken('refresh', payload),
    ]);
    return { accessToken, refreshToken };
  }

  private async issueTokensAndPersist(user: { id: string; email: string }) {
    const tokens = await this.issueTokens(user.id, user.email);
    await this.storeRefreshTokenHash(user.id, tokens.refreshToken);
    return { user: { id: user.id, email: user.email }, ...tokens };
  }

  private async storeRefreshTokenHash(userId: string, refreshToken: string) {
    // Safety: never store raw refresh tokens
    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await this.users.setRefreshTokenHash(userId, refreshTokenHash);
  }
}
