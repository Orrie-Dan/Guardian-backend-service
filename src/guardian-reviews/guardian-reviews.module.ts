import { Module } from '@nestjs/common';
import { GuardianReviewsService } from './guardian-reviews.service';

@Module({
  providers: [GuardianReviewsService],
  exports: [GuardianReviewsService],
})
export class GuardianReviewsModule {}
