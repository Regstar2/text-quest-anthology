export interface InterstitialFrequencyPolicyConfig {
  restartsPerAd: number;
}

export class InterstitialFrequencyPolicy {
  private restartsSinceLastAttempt = 0;

  constructor(private readonly config: InterstitialFrequencyPolicyConfig) {}

  registerRestart(): boolean {
    this.restartsSinceLastAttempt += 1;

    if (this.restartsSinceLastAttempt < this.config.restartsPerAd) {
      return false;
    }

    this.restartsSinceLastAttempt = 0;
    return true;
  }
}
