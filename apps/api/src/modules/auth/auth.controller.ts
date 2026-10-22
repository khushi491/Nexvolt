import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RefreshSchema, RequestOtpSchema, VerifyOtpSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import { Public, ReqMeta, type RequestMeta } from '../../common/auth/decorators';
import { AuthService, TERMS_VERSION } from './auth.service';

class RequestOtpDto extends createZodDto(RequestOtpSchema) {}
class VerifyOtpDto extends createZodDto(VerifyOtpSchema) {}
class RefreshDto extends createZodDto(RefreshSchema) {}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(@Body() body: RequestOtpDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.requestOtp(body.phone, meta.ip);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Body() body: VerifyOtpDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.verifyOtp(body, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() body: RefreshDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.refresh(body.refreshToken, meta);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: RefreshDto) {
    await this.auth.logout(body.refreshToken);
  }

  @Public()
  @Post('terms')
  @HttpCode(200)
  terms() {
    return {
      termsVersion: TERMS_VERSION,
      notice:
        'DRAFT terms and privacy notice for the Nexvolt MVP. Not reviewed by counsel. Must be finalised (incl. DPDP Act 2023 obligations) before launch.',
    };
  }
}
