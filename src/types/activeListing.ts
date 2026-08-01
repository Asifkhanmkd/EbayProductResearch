// created on 08/05/2026

export interface ActiveListing {
  title: string;
  url: string;
  price: number;
  totalPrice: number;

  seller?: {
    username?: string;
    feedbackScore?: number;
    feedbackPercentage?: number;
    topRated?: boolean;
  };

  availableQuantity?: number | null;
  soldQuantity?: number | null;

  condition?: string;
}
