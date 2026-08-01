export interface RawActivePayload {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  condition?: string;
  conditionId?: string;
  seller?: { username: string };
}

export class ActiveDto {
  public readonly itemId: string;
  public readonly title: string;
  public readonly price: number;
  public readonly condition: string;
  public readonly sellerName: string;

  constructor(raw: RawActivePayload) {
    this.itemId = raw.itemId || 'UNKNOWN';
    this.title = raw.title || 'UNKNOWN';
    this.price = parseFloat(raw.price?.value || '0') || 0;
    this.condition = (raw.condition || 'UNKNOWN').toUpperCase();
    this.sellerName = raw.seller?.username || 'UNKNOWN';
  }
}