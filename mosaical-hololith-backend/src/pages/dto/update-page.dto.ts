import { IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase kebab-case' })
  slug?: string;

  @IsOptional()
  @IsObject()
  content?: any;
}
