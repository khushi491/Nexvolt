import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../../config/env';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmulatorOtpProvider } from './otp/emulator-otp.provider';
import { OTP_PROVIDER } from './otp/otp-provider';
import { TwilioVerifyOtpProvider } from './otp/twilio-verify.provider';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: OTP_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.OTP_PROVIDER === 'twilio_verify'
          ? new TwilioVerifyOtpProvider(
              env.TWILIO_ACCOUNT_SID!,
              env.TWILIO_AUTH_TOKEN!,
              env.TWILIO_VERIFY_SERVICE_SID!,
            )
          : new EmulatorOtpProvider(env.OTP_EMULATOR_FIXED_CODE),
    },
  ],
})
export class AuthModule {}

/** Registered globally in AppModule so the global guard can verify tokens. */
export const jwtModule = JwtModule.registerAsync({
  global: true,
  inject: [ENV],
  useFactory: (env: Env) => ({
    secret: env.JWT_ACCESS_SECRET,
    signOptions: { algorithm: 'HS256', issuer: 'nexvolt-api', audience: 'nexvolt' },
    verifyOptions: { algorithms: ['HS256'], issuer: 'nexvolt-api', audience: 'nexvolt' },
  }),
});
