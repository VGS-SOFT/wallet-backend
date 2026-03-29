export interface GoogleProfile {
  google_id: string;
  email: string;
  name: string;
  avatar_url: string;
}

export interface JwtPayload {
  sub: string;   // user UUID
  email: string;
}
