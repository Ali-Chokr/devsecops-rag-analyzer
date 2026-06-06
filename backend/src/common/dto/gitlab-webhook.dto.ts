import { IsOptional, IsString } from 'class-validator';

export class GitLabWebhookDto {
  @IsOptional()
  @IsString()
  object_kind?: string;

  [key: string]: unknown;
}
