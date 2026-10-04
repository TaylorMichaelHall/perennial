declare global {
	namespace App {
		interface Locals {
			/** Whether the request carries a valid session. */
			signedIn: boolean;
		}
	}
}

export {};
