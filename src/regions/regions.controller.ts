import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RegionsService } from './regions.service';

@ApiTags('regions')
@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Public()
  @Get('districts')
  districts() {
    return this.regions.listDistricts();
  }
}
