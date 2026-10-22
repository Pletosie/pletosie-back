import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
export class ZoneDto {
  @IsString() @Length(2, 80) id: string;
  @IsString() @Length(2, 100) name: string;
  @IsInt() @Min(0) @Max(1000000) fee: number;
}
export class ZonesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ZoneDto)
  zones: ZoneDto[];
  @IsString() @Length(3, 300) reason: string;
}
export class MeasurementDto {
  @IsString() @Length(1, 20) size: string;
  @IsInt() @Min(1) @Max(300) chest: number;
  @IsInt() @Min(1) @Max(300) waist: number;
  @IsInt() @Min(1) @Max(300) hips: number;
}
export class GuideDto {
  @IsString() @Length(2, 100) version: string;
  @IsString() @Length(10, 1000) instructions: string;
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MeasurementDto)
  measurements: MeasurementDto[];
}
