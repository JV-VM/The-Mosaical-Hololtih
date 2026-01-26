import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class TrackViewDto {
  @IsIn(['STORE_VIEW', 'PRODUCT_VIEW', 'PAGE_VIEW'])
  type!: 'STORE_VIEW' | 'PRODUCT_VIEW' | 'PAGE_VIEW';

  @IsOptional() @IsString() storeId: string | undefined;
  @IsOptional() @IsString() productId: string | undefined;
  @IsOptional() @IsString() pageId: string | undefined;

  // viewer token from client (uuid string)
  @IsOptional()
  @IsString()
  @MinLength(8)
  viewerId: string | undefined;
}
