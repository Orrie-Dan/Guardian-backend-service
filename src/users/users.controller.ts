import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @RequirePermissions('users:read_self')
  me(@CurrentUser() user: AuthUserPayload) {
    return this.users.getMe(user);
  }

  @Patch('me')
  @RequirePermissions('users:update_self')
  updateMe(
    @CurrentUser() user: AuthUserPayload,
    @Body() body: { email?: string },
  ) {
    return this.users.updateMe(user, body);
  }
}
