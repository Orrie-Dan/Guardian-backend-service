import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { DocumentsModule } from '../documents/documents.module';
import { GuardiansModule } from '../guardians/guardians.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';
import { AuthService } from './auth.service';
import { RegisterOnboardingService } from './register-onboarding.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { PermissionResolverService } from './permission-resolver.service';

@Module({
  imports: [
    DocumentsModule,
    GuardiansModule,
    NotificationsModule,
    SmsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegisterOnboardingService,
    OtpService,
    TokenService,
    PasswordService,
    JwtStrategy,
    PermissionResolverService,
  ],
  exports: [
    AuthService,
    RegisterOnboardingService,
    TokenService,
    OtpService,
    PasswordService,
    PermissionResolverService,
  ],
})
export class AuthModule {}
