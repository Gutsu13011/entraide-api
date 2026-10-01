import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException();
    }

    const parts = authorization.trim().split(/\s+/);
    const [scheme, token] = parts;

    if (parts.length !== 2 || scheme.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException();
    }

    let payload: { sub: string };

    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
    } catch {
      throw new UnauthorizedException();
    }

    if (typeof payload?.sub !== 'string' || !/^[1-9]\d*$/.test(payload.sub)) {
      throw new UnauthorizedException();
    }

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId)) {
      throw new UnauthorizedException();
    }

    request.user = { id: userId };
    return true;
  }
}
