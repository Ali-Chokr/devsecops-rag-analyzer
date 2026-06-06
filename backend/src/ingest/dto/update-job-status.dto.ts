import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateJobStatusDto {
  @IsIn(['processing', 'completed', 'failed'])
  status!: 'processing' | 'completed' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error_message?: string;
}
