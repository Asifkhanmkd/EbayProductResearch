export interface RawSoldPayload {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  shippingOptions?: Array<{ shippingCost?: { value: string } }>;
  condition?: string;
}

export class SoldDto {
  public readonly itemId: string;
  public readonly title: string;
  public readonly price: number;
  public readonly shippingCost: number;
  public readonly condition: string;

  constructor(raw: RawSoldPayload) {
    this.itemId = raw.itemId || 'UNKNOWN';
    this.title = raw.title || 'UNKNOWN';
    this.price = parseFloat(raw.price?.value || '0') || 0;
    
    const shippingRaw = raw.shippingOptions?.[0]?.shippingCost?.value;
    this.shippingCost = parseFloat(shippingRaw || '0') || 0;
    
    this.condition = (raw.condition || 'UNKNOWN').toUpperCase();
  }
}