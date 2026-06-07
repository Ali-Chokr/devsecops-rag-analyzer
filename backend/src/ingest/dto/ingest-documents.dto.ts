import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class IngestDocumentDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @MaxLength(50)
  source_type!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  environment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  service_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source_key?: string;
}

export class IngestDocumentsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngestDocumentDto)
  documents!: IngestDocumentDto[];

  @IsOptional()
  @IsBoolean()
  replace_source_keys?: boolean;
}
