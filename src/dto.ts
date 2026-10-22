import { Type } from 'class-transformer';
import { OmitType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ArrayUnique,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class LoginDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @Length(10, 128) password: string;
}
export class RegisterDto extends LoginDto {
  @IsString() @Length(2, 100) name: string;
}
export class VariantDto {
  @IsString() @Length(1, 80) id: string;
  @IsString() @Length(1, 60) color: string;
  @IsHexColor() hex: string;
  @IsIn(['XS', 'S', 'M', 'L', 'XL', 'XXL']) size: string;
  @IsInt() @Min(0) @Max(10000) stock: number;
  @IsInt() @Min(1) @Max(10000000) price: number;
  @IsString() @MaxLength(1000) image: string;
}
export class VideoVerifyDto {
  @IsString() @Matches(/^pletosie\/creations\/[a-f0-9-]{36}$/) publicId: string;
}
export class ProductDto {
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ArrayUnique()
  @IsString({each:true}) @MaxLength(1000,{each:true})
  @Matches(/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/video\/upload\//,{each:true}) videos?: string[];
  @IsString() @Length(2, 120) name: string;
  @IsString() @Length(2, 120) slug: string;
  @IsIn(['Robes', 'Ensembles', 'Hauts', 'Jupes']) category: string;
  @IsString() @Length(10, 3000) description: string;
  @IsString() @Length(2, 200) material: string;
  @IsString() @Length(2, 300) care: string;
  @IsInt() @Min(1) @Max(10000000) price: number;
  @IsString() @MaxLength(1000) image: string;
  @IsBoolean() published: boolean;
  @IsBoolean() madeToOrder: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];
  @IsString() @Length(3, 300) reason: string;
}
export class ItemDto {
  @IsString() @MaxLength(80) productId: string;
  @IsString() @MaxLength(80) variantId: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
}
export class AddressDto {
  @IsString() @Length(2, 100) name: string;
  @IsString() @Length(8, 25) phone: string;
  @IsString() @Length(10, 500) details: string;
  @IsString() @Length(2, 80) zone: string;
}
export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
  @ValidateNested() @Type(() => AddressDto) address: AddressDto;
  @IsString() @Length(8, 100) key: string;
  @IsIn(['2026-10-draft']) termsVersion: string;
  @IsBoolean() accepted: boolean;
  @IsInt() @Min(1) expectedTotal: number;
}
export class ConversationDto {
  @IsOptional() @IsString() @MaxLength(80) productId?: string;
  @IsOptional() @IsString() @MaxLength(80) variantId?: string;
}
export class MessageDto {
  @IsString() @Length(8, 100) clientId: string;
  @IsIn(['text', 'audio']) kind: string;
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
  @IsOptional() @IsString() @MaxLength(14000000) audio?: string;
  @IsOptional()
  @IsIn(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'])
  mime?: string;
}
export class EventDto {
  @IsIn(['product_view', 'cart_add']) kind: string;
  @IsString() @Length(1, 80) productId: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
}
export class StatusDto {
  @IsIn(['preparing', 'ready', 'in_delivery', 'delivered']) status: string;
  @IsString() @Length(3, 300) reason: string;
}
export class OfferDto {
  @IsString() @Length(10, 2000) description: string;
  @IsInt() @Min(1) @Max(10000000) price: number;
  @IsString() @MaxLength(50) expiresAt: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
  @IsInt() @Min(0) @Max(1000000) deliveryFee: number;
}
export class OfferCheckoutDto extends OmitType(CheckoutDto, [
  'items',
] as const) {}
export class PayDto {
  @IsIn(['mtn', 'moov', 'celtiis_bj']) operator: string;
  @IsString() @Length(13, 13) phone: string;
}
export class ProfileDto {
  @IsString() @Length(2, 100) name: string;
}
export class RefundDto {
  @IsIn(['confirmed', 'rejected']) status: string;
  @IsString() @Length(3, 300) reason: string;
  @IsOptional() @IsString() @Length(3, 200) transferReference?: string;
}
export class CartDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}
export class CapacityDto {
  @IsString() @Length(10, 10) date: string;
  @IsInt() @Min(0) @Max(500) quota: number;
  @IsString() @Length(3, 300) reason: string;
}
