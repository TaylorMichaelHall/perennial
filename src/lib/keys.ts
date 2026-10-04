/** An API key as the app shows it. The secret itself is only seen once, when it is minted. */
export interface ApiKey {
	id: number;
	name: string;
	/** Milliseconds since the epoch, as are the two below. */
	created_at: number;
	/** The moment the key stops working, or `null` if it never does. */
	expires_at: number | null;
	last_used_at: number | null;
}

/** A newly minted key, along with the secret to hand to whatever will use it. */
export interface MintedApiKey extends ApiKey {
	token: string;
}
