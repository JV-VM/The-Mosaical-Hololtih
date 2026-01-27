import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  refreshTokenHash?: string | null;
};

const bcryptHashMock = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
const bcryptCompareMock = bcrypt.compare as jest.MockedFunction<
  typeof bcrypt.compare
>;

function createUsersMock() {
  return {
    findByEmail: jest.fn<Promise<UserRecord | null>, [string]>(),
    findById: jest.fn<Promise<UserRecord | null>, [string]>(),
    createUser: jest.fn<
      Promise<UserRecord>,
      [{ email: string; passwordHash: string }]
    >(),
    setRefreshTokenHash: jest.fn<
      Promise<UserRecord>,
      [string, string | null]
    >(),
  };
}

function createJwtMock() {
  return {
    signAsync: jest.fn<
      Promise<string>,
      [object, { secret: string; expiresIn: number }]
    >(),
    verifyAsync: jest.fn<
      Promise<{ sub: string }>,
      [string, { secret: string }]
    >(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let usersMock: ReturnType<typeof createUsersMock>;
  let jwtMock: ReturnType<typeof createJwtMock>;

  beforeEach(async () => {
    usersMock = createUsersMock();
    jwtMock = createJwtMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersMock },
        { provide: JwtService, useValue: jwtMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    bcryptHashMock.mockReset();
    bcryptCompareMock.mockReset();
    jwtMock.signAsync.mockReset();
    jwtMock.verifyAsync.mockReset();
  });

  describe('register', () => {
    it('throws BadRequestException when email is already in use', async () => {
      usersMock.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'taken@example.com',
        passwordHash: 'hash',
      });

      await expect(
        service.register('taken@example.com', 'Password123!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersMock.createUser).not.toHaveBeenCalled();
    });

    it('normalizes email, hashes password, and returns issued tokens', async () => {
      usersMock.findByEmail.mockResolvedValue(null);
      bcryptHashMock
        .mockResolvedValueOnce('password-hash')
        .mockResolvedValueOnce('refresh-hash');
      usersMock.createUser.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'password-hash',
      });
      jwtMock.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      usersMock.setRefreshTokenHash.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'password-hash',
        refreshTokenHash: 'refresh-hash',
      });

      const result = await service.register(
        '  USER@Example.COM  ',
        'Password123!',
      );

      expect(usersMock.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(bcryptHashMock).toHaveBeenCalledWith('Password123!', 12);
      expect(usersMock.createUser).toHaveBeenCalledWith({
        email: 'user@example.com',
        passwordHash: 'password-hash',
      });
      expect(result).toMatchObject({
        user: { id: 'user-1', email: 'user@example.com' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      usersMock.findByEmail.mockResolvedValue(null);

      await expect(
        service.login('missing@example.com', 'Password123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(bcryptCompareMock).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the password is invalid', async () => {
      usersMock.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'stored-hash',
      });
      bcryptCompareMock.mockResolvedValue(false);

      await expect(
        service.login('user@example.com', 'wrong'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns tokens when credentials are valid', async () => {
      usersMock.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'stored-hash',
      });
      bcryptCompareMock.mockResolvedValue(true);
      bcryptHashMock.mockResolvedValue('refresh-hash');
      jwtMock.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      usersMock.setRefreshTokenHash.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'stored-hash',
        refreshTokenHash: 'refresh-hash',
      });

      const result = await service.login('user@example.com', 'Password123!');

      expect(bcryptCompareMock).toHaveBeenCalledWith(
        'Password123!',
        'stored-hash',
      );
      expect(result).toMatchObject({
        user: { id: 'user-1', email: 'user@example.com' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when the refresh token does not match', async () => {
      usersMock.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'hash',
        refreshTokenHash: 'stored-refresh-hash',
      });
      bcryptCompareMock.mockResolvedValue(false);

      await expect(
        service.refresh('user-1', 'bad-refresh'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues new tokens when the refresh token matches', async () => {
      usersMock.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'hash',
        refreshTokenHash: 'stored-refresh-hash',
      });
      bcryptCompareMock.mockResolvedValue(true);
      bcryptHashMock.mockResolvedValue('new-refresh-hash');
      jwtMock.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      usersMock.setRefreshTokenHash.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'hash',
        refreshTokenHash: 'new-refresh-hash',
      });

      const result = await service.refresh('user-1', 'valid-refresh');

      expect(bcryptCompareMock).toHaveBeenCalledWith(
        'valid-refresh',
        'stored-refresh-hash',
      );
      expect(result).toMatchObject({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });
  });
});
