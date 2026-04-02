export interface GeoCoordinates {
  lat: number;
  lon: number;
}

export interface GeoAdapter {
  getCurrentCoordinates(): Promise<GeoCoordinates | null>;
}

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareAdapter {
  share(payload: SharePayload): Promise<boolean>;
}

export interface DeepLinkAdapter {
  getInitialUrl(): Promise<string | null>;
  subscribe(handler: (url: string) => void): () => void;
}

