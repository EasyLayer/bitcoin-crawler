import { IsOptional, IsString, IsNumber, ValidateNested, IsArray, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

class FilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  blockHeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  version?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

class PagingDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset?: number;
}

export class QueryDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'modelIds should be a non-empty array' })
  @IsString({ each: true })
  modelIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FilterDto)
  filter?: FilterDto;

  @ValidateNested()
  @Type(() => PagingDto)
  paging?: PagingDto;
}
