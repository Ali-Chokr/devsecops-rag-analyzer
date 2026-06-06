import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ForwardLogsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  service_name?: string;

  @IsOptional()
  @IsIn(['production', 'staging', 'dev'])
  environment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  hostname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  log_level?: string;
}
