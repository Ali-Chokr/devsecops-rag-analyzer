import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ScrapeRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  environment?: string;

  @IsOptional()
  @IsIn(['filesystem', 'api', 'git'])
  mode?: 'filesystem' | 'api' | 'git';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  namespace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  repo_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subpath?: string;
}
