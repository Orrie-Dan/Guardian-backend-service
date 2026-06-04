import { PartialType } from '@nestjs/swagger';
import { CreateBillingPolicyDto } from './create-billing-policy.dto';

export class UpdateBillingPolicyDto extends PartialType(CreateBillingPolicyDto) {}
