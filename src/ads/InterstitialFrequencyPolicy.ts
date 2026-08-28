export interface InterstitialFrequencyPolicyConfig {
  endingsPerAd: number;
  cooldownMs: number;
}

export class InterstitialFrequencyPolicy {
  private endingsSinceLastAd = 0;
  private lastShownAt: number | null = null;

  constructor(private readonly config: InterstitialFrequencyPolicyConfig) {}

  registerEnding(now = Date.now()): boolean {
    this.endingsSinceLastAd += 1;

    if (this.endingsSinceLastAd < this.config.endingsPerAd) {
      return false;
    }

    if (
      this.lastShownAt !== null &&
      now - this.lastShownAt < this.config.cooldownMs
    ) {
      return false;
    }

    return true;
  }

  markShown(now = Date.now()): void {
    this.endingsSinceLastAd = 0;
    this.lastShownAt = now;
  }
}
