import { Module } from '@nestjs/common';
import { S3ArchiveService } from './s3-archive.service';

@Module({
  providers: [S3ArchiveService],
  exports: [S3ArchiveService],
})
export class ArchiveModule {}
