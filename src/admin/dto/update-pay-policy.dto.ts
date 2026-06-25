import { PartialType } from '@nestjs/swagger';
import { CreatePayPolicyDto } from './create-pay-policy.dto';

export class UpdatePayPolicyDto extends PartialType(CreatePayPolicyDto) {}
