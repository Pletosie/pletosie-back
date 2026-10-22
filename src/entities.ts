import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Index,
} from 'typeorm';
export class Variant {
  id: string;
  color: string;
  hex: string;
  size: string;
  stock: number;
  price: number;
  image: string;
}
@Entity('users')
export class User {
  @PrimaryColumn() id: string;
  @Column() name: string;
  @Index({ unique: true }) @Column() email: string;
  @Column({ select: false, nullable: true }) password: string;
  @Index({ unique: true })
  @Column({ nullable: true, select: false })
  googleSub: string;
  @Column({ default: 'client' }) role: string;
  @CreateDateColumn() createdAt: Date;
}
@Entity('sessions')
export class Session {
  @PrimaryColumn() id: string;
  @Index() @Column() userId: string;
  @Column() expiresAt: string;
}
@Entity('oauth_attempts')
export class OAuthAttempt {
  @PrimaryColumn() id: string;
  @Column() verifier: string;
  @Column() nonce: string;
  @Column() expiresAt: string;
}
@Entity('products')
export class Product {
  @PrimaryColumn() id: string;
  @Index({ unique: true }) @Column() slug: string;
  @Column() name: string;
  @Column() category: string;
  @Column('text') description: string;
  @Column() material: string;
  @Column() care: string;
  @Column('integer') price: number;
  @Column() image: string;
  @Column({ default: true }) published: boolean;
  @Column({ default: false }) madeToOrder: boolean;
  @Column('simple-json') variants: Variant[];
  @CreateDateColumn() createdAt: Date;
}
export type OrderLine = {
  productId: string;
  variantId: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  image: string;
  sizeGuide?: unknown;
};
@Entity('orders')
@Index(['userId', 'key'], { unique: true })
export class Order {
  @PrimaryColumn() id: string;
  @Index() @Column() userId: string;
  @Column() key: string;
  @Column('simple-json') items: OrderLine[];
  @Column('simple-json') address: {
    name: string;
    phone: string;
    details: string;
    zone: string;
  };
  @Column('integer') subtotal: number;
  @Column('integer') deliveryFee: number;
  @Column('integer') total: number;
  @Column({ default: 'pending' }) paymentStatus: string;
  @Index() @Column({ default: 'awaiting_payment' }) status: string;
  @Column({ nullable: true }) paidAt: string;
  @Column({ nullable: true }) deadline: string;
  @Column() reservationExpiresAt: string;
  @Column({ default: false }) released: boolean;
  @Column() termsVersion: string;
  @Column({ nullable: true }) capacityPeriod: string;
  @Column('integer', { default: 0 }) capacityUnits: number;
  @Column({ nullable: true, unique: true }) offerId: string;
  @Column('simple-json') history: {
    status: string;
    date: string;
    note: string;
  }[];
  @CreateDateColumn() createdAt: Date;
}
@Entity('conversations')
export class Conversation {
  @PrimaryColumn() id: string;
  @Index() @Column() userId: string;
  @Column({ nullable: true }) productId: string;
  @Column() subject: string;
  @Column('simple-json', { nullable: true }) context: {
    name: string;
    slug: string;
    variant: string;
    image?: string;
    price?: number;
    category?: string;
  } | null;
  @Column() updatedAt: string;
  @Column({ default: '' }) clientReadAt: string;
  @Column({ default: '' }) adminReadAt: string;
}
@Entity('messages')
@Index(['conversationId', 'clientId'], { unique: true })
export class Message {
  @PrimaryColumn() id: string;
  @Index() @Column() conversationId: string;
  @Column() userId: string;
  @Column() clientId: string;
  @Column() kind: string;
  @Column('text') text: string;
  @Column('text', { nullable: true }) audio: string | null;
  @Column({ nullable: true }) mime: string;
  @CreateDateColumn() createdAt: Date;
}
@Entity('offers')
export class Offer {
  @PrimaryColumn() id: string;
  @Column() conversationId: string;
  @Column() userId: string;
  @Column('text') description: string;
  @Column('integer') price: number;
  @Column() expiresAt: string;
  @Column({ default: 'pending' }) status: string;
  @Column('integer', { default: 1 }) version: number;
  @Column('integer', { default: 1 }) quantity: number;
  @Column('integer', { default: 0 }) deliveryFee: number;
}
@Entity('events')
export class AnalyticsEvent {
  @PrimaryColumn() id: string;
  @Column() kind: string;
  @Column() productId: string;
  @Column('integer') quantity: number;
  @CreateDateColumn() createdAt: Date;
}
@Entity('audit')
export class Audit {
  @PrimaryColumn() id: string;
  @Column() actor: string;
  @Column() action: string;
  @Column() reference: string;
  @Column('text') reason: string;
  @CreateDateColumn() createdAt: Date;
}
@Entity('payment_attempts')
export class PaymentAttempt {
  @PrimaryColumn() id: string;
  @Index() @Column() orderId: string;
  @Column() userId: string;
  @Column('integer') amount: number;
  @Column({ default: 'XOF' }) currency: string;
  @Column() operator: string;
  @Column({ nullable: true, unique: true }) reference: string;
  @Column({ default: 'created' }) status: string;
  @Column({ default: 0 }) checks: number;
  @Column() updatedAt: string;
  @CreateDateColumn() createdAt: Date;
}
@Entity('notifications')
export class Notification {
  @PrimaryColumn() id: string;
  @Index() @Column() userId: string;
  @Column() kind: string;
  @Column() title: string;
  @Column() href: string;
  @Column({ default: false }) read: boolean;
  @Column({ default: false }) pushQueued: boolean;
  @CreateDateColumn() createdAt: Date;
}
@Entity('push_subscriptions')
export class PushDevice {
  @PrimaryColumn() id: string;
  @Index() @Column() userId: string;
  @Column() sessionId: string;
  @Column('text') endpoint: string;
  @Column() p256dh: string;
  @Column() auth: string;
  @CreateDateColumn() createdAt: Date;
}
@Entity('push_deliveries')
export class PushDelivery {
  @PrimaryColumn() id: string;
  @Column() notificationId: string;
  @Column() deviceId: string;
  @Column({ default: 'pending' }) status: string;
  @Column('integer', { default: 0 }) attempts: number;
  @Column() nextAttemptAt: string;
  @Column({ nullable: true }) leaseUntil: string;
}
@Entity('settings')
export class Setting {
  @PrimaryColumn() id: string;
  @Column('simple-json') value: unknown;
}
@Entity('addresses')
export class Address {
  @PrimaryColumn() id: string;
  @Column() userId: string;
  @Column() name: string;
  @Column() phone: string;
  @Column() details: string;
  @Column() zone: string;
}
@Entity('refunds')
export class Refund {
  @PrimaryColumn() id: string;
  @Column() orderId: string;
  @Column('integer') amount: number;
  @Column() status: string;
  @Column() reason: string;
  @Column({ nullable: true }) transferReference: string;
  @CreateDateColumn() createdAt: Date;
}
@Entity('production_capacity')
export class ProductionCapacity {
  @PrimaryColumn() id: string;
  @Column('integer') quota: number;
  @Column('integer', { default: 0 }) reserved: number;
}
@Entity('carts')
export class Cart {
  @PrimaryColumn() id: string;
  @Column('simple-json') items: {
    productId: string;
    variantId: string;
    quantity: number;
  }[];
}
export const entities = [
  User,
  Session,
  OAuthAttempt,
  Product,
  Order,
  Conversation,
  Message,
  Offer,
  AnalyticsEvent,
  Audit,
  PaymentAttempt,
  Notification,
  PushDevice,
  PushDelivery,
  Setting,
  Address,
  Refund,
  ProductionCapacity,
  Cart,
];
