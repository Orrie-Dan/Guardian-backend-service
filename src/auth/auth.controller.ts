import {

  Body,

  Controller,

  Get,

  Param,

  ParseUUIDPipe,

  Patch,

  Post,

  Req,

  UseGuards,

} from '@nestjs/common';

import { Request } from 'express';

import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from './decorators/current-user.decorator';

import { Public } from './decorators/public.decorator';

import { RefreshTokenDto } from './dto/refresh-token.dto';

import {

  RegisterDocumentConfirmDto,

  RegisterDocumentPresignDto,

} from './dto/register-document.dto';

import { PatchRegisterBusinessDto } from './dto/register-v2/patch-business.dto';

import { PatchRegisterLocationDto } from './dto/register-v2/patch-location.dto';

import { PatchRegisterPaymentDto } from './dto/register-v2/patch-payment.dto';

import { PatchRegisterProfileDto } from './dto/register-v2/patch-profile.dto';

import { RegisterResumeDto } from './dto/register-v2/register-resume.dto';

import { RegisterStartDto } from './dto/register-v2/register-start.dto';

import { RegisterStartVerifyDto } from './dto/register-v2/register-start-verify.dto';

import { RequestOtpDto } from './dto/request-otp.dto';

import { SetContextDto } from './dto/set-context.dto';

import { SetPasswordDto } from './dto/set-password.dto';

import { SignInOtpRequestDto } from './dto/sign-in-otp-request.dto';

import { SignInOtpVerifyDto } from './dto/sign-in-otp-verify.dto';

import { SignInPasswordDto } from './dto/sign-in-password.dto';

import { VerifyOtpDto } from './dto/verify-otp.dto';

import { JwtAuthGuard } from './guards/jwt-auth.guard';

import { AuthUserPayload } from './interfaces/auth-user.interface';

import { AuthService } from './auth.service';

import { RegisterOnboardingService } from './register-onboarding.service';

import { TokenService } from './token.service';



@ApiTags('auth')

@Controller('auth')

export class AuthController {

  constructor(

    private readonly auth: AuthService,

    private readonly registerOnboarding: RegisterOnboardingService,

    private readonly tokens: TokenService,

  ) {}



  @Public()

  @Post('register/start')

  @Throttle({ default: { limit: 3, ttl: 60_000 } })

  @ApiOperation({ summary: 'Registration step 1a: request phone OTP' })

  registerStart(@Body() dto: RegisterStartDto) {

    return this.registerOnboarding.startRegistration(dto.phone);

  }



  @Public()

  @Post('register/start/verify')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Registration step 1b: verify OTP, issue onboarding token' })

  registerStartVerify(@Body() dto: RegisterStartVerifyDto) {

    return this.registerOnboarding.verifyRegistrationStart(dto.phone, dto.code);

  }



  @Public()

  @Patch('register/profile')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Registration: name, email, password (onboarding token)' })

  registerPatchProfile(

    @Body() dto: PatchRegisterProfileDto,

    @Req() req: Request,

  ) {

    return this.registerOnboarding.patchProfile(req.headers.authorization, dto);

  }



  @Public()

  @Patch('register/business')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Registration: business details, creates org (onboarding token)' })

  registerPatchBusiness(

    @Body() dto: PatchRegisterBusinessDto,

    @Req() req: Request,

  ) {

    return this.registerOnboarding.patchBusiness(req.headers.authorization, dto);

  }



  @Public()

  @Post('register/documents/presign')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Registration: presign verification document' })

  registerDocumentPresign(

    @Body() dto: RegisterDocumentPresignDto,

    @Req() req: Request,

  ) {

    return this.registerOnboarding.registerDocumentPresign(

      req.headers.authorization,

      dto,

    );

  }



  @Public()

  @Post('register/documents/:id/confirm')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Registration: confirm document upload' })

  registerDocumentConfirm(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: RegisterDocumentConfirmDto,

    @Req() req: Request,

  ) {

    return this.registerOnboarding.registerDocumentConfirm(

      req.headers.authorization,

      id,

      dto.documentType,

    );

  }



  @Public()

  @Patch('register/payment')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Registration: mobile money details' })

  registerPatchPayment(

    @Body() dto: PatchRegisterPaymentDto,

    @Req() req: Request,

  ) {

    return this.registerOnboarding.patchPayment(req.headers.authorization, dto);

  }



  @Public()

  @Patch('register/location')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({

    summary: 'Registration: primary site address (district centroid coords server-side)',

  })

  registerPatchLocation(

    @Body() dto: PatchRegisterLocationDto,

    @Req() req: Request,

  ) {

    return this.registerOnboarding.patchLocation(req.headers.authorization, dto);

  }



  @Public()

  @Get('register/status')

  @ApiOperation({ summary: 'Registration progress (onboarding token)' })

  registerStatus(@Req() req: Request) {

    return this.registerOnboarding.getRegistrationStatus(req.headers.authorization);

  }



  @Public()

  @Post('register/submit')

  @Throttle({ default: { limit: 5, ttl: 60_000 } })

  @ApiOperation({ summary: 'Submit application and receive full JWT' })

  registerSubmit(@Req() req: Request) {

    return this.registerOnboarding.submitRegistration(req.headers.authorization);

  }



  @Public()

  @Post('register/resume')

  @Throttle({ default: { limit: 5, ttl: 60_000 } })

  @ApiOperation({ summary: 'Resume incomplete registration' })

  registerResume(@Body() dto: RegisterResumeDto) {

    return this.registerOnboarding.resumeRegistration(dto);

  }



  @Public()

  @Post('sign-in/otp/request')

  @Throttle({ default: { limit: 3, ttl: 60_000 } })

  @ApiOperation({ summary: 'Request sign-in OTP (existing users only)' })

  signInOtpRequest(@Body() dto: SignInOtpRequestDto) {

    return this.auth.signInRequestOtp(dto.phone);

  }



  @Public()

  @Post('sign-in/otp/verify')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Verify sign-in OTP' })

  signInOtpVerify(@Body() dto: SignInOtpVerifyDto) {

    return this.auth.signInVerifyOtp(dto.phone, dto.code);

  }



  @Public()

  @Post('sign-in/password')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: 'Sign in with phone and password' })

  signInPassword(@Body() dto: SignInPasswordDto) {

    return this.auth.signInWithPassword(dto.phone, dto.password);

  }



  @Public()

  @Post('password/set')

  @Throttle({ default: { limit: 5, ttl: 60_000 } })

  @ApiOperation({ summary: 'Set password (setup token or authenticated)' })

  async setPassword(@Body() dto: SetPasswordDto, @Req() req: Request) {

    const userId = await this.tokens.tryResolveAccessUserId(

      req.headers.authorization,

    );

    return this.auth.setPassword(dto, userId);

  }



  @Public()

  @Post('otp/request')

  @Throttle({ default: { limit: 3, ttl: 60_000 } })

  @ApiOperation({ summary: '[Deprecated] Alias for sign-in OTP request' })

  requestOtp(@Body() dto: RequestOtpDto) {

    return this.auth.signInRequestOtp(dto.phone);

  }



  @Public()

  @Post('otp/verify')

  @Throttle({ default: { limit: 10, ttl: 60_000 } })

  @ApiOperation({ summary: '[Deprecated] Alias for sign-in OTP verify' })

  verifyOtp(@Body() dto: VerifyOtpDto) {

    return this.auth.signInVerifyOtp(dto.phone, dto.code);

  }



  @Public()

  @Post('refresh')

  @Throttle({ default: { limit: 20, ttl: 60_000 } })

  @ApiOperation({ summary: 'Rotate refresh token' })

  refresh(@Body() dto: RefreshTokenDto) {

    return this.auth.refresh(dto.refreshToken);

  }



  @Post('logout')

  @UseGuards(JwtAuthGuard)

  @ApiOperation({ summary: 'Revoke refresh token' })

  logout(

    @Body() dto: RefreshTokenDto,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.auth.logout(dto.refreshToken, user.sub);

  }



  @Post('context')

  @UseGuards(JwtAuthGuard)

  @ApiOperation({ summary: 'Switch active organization and re-issue tokens' })

  setContext(

    @Body() dto: SetContextDto,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.auth.setContext(user.sub, dto.organizationId);

  }

}


