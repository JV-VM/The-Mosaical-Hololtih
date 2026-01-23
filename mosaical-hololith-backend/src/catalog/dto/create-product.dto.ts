import { IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase kebab-case' })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsString()
  currency?: string; // default USD in DB

  // Keep simple for MVP: JSON blob for image URLs/metadata
  @IsOptional()
  media?: any;
}