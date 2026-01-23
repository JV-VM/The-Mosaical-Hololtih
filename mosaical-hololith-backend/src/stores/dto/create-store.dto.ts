import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @MinLength(2)
  name!: string;

  // URL-friendly slug
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case',
  })
  slug!: string;

  // subdomain part only, e.g. "myshop" -> myshop.mosaical.app
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'subdomain must be lowercase kebab-case',
  })
  subdomain!: string;

  @IsOptional()
  @IsString()
  customDomain?: string;
}
