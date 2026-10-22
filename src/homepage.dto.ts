import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
export class HomepageDto {
  @IsString() @MaxLength(100) heroProductId: string;
  @IsString() @Length(1, 100) title: string;
  @IsString() @Length(1, 200) subtitle: string;
  @IsString() @Length(1, 100) selectionTitle: string;
  @IsArray()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  hero: string[];
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  looks: string[];
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  selection: string[];
  @IsArray()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  campaigns: string[];
}
