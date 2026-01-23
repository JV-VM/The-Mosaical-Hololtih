import { IsObject, IsString, Matches, MinLength } from 'class-validator';

export class CreatePageDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase kebab-case' })
  slug!: string;

  @IsObject()
  content!: any;
}
