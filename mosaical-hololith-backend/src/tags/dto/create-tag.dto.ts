import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case',
  })
  slug!: string;

  // 1=A, 2=B, 3=C
  @IsOptional()
  @IsInt()
  @Min(1)
  tier?: number;

  @IsOptional()
  flags?: any; // JSON blob
}
