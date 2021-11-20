/** @format */

import { Series, StdDev } from './streaming.js';
import { OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { action, actions, listeners, poke } from './declare-events.js';

export class Ticker extends HTMLParagraphElement {
  constructor() {
    super();

    this.scheduleNextPulse();
  }

  private accessors = {
    ticks: new OExplicitNodeUpdater(this, undefined, '0'),
    interval: new OExplicitNodeUpdater(this, 'data-interval', '500'),
  };

  public ticks = new Access.Numeric(this.accessors.ticks);
  public interval = new Access.Numeric(this.accessors.interval);

  get tick(): number {
    return this.ticks.number;
  }

  set tick(now: number) {
    if (now == this.tick) {
      return;
    }

    this.ticks.number = now;

    if (now > 0) {
      poke(this, 'tick');
    }
  }

  protected readonly defaultPulseDelay: number = 100;
  protected readonly minPulseDelay: number = 20;
  protected readonly maxPulseDelay: number = 500;
  protected readonly resetPulsarInterval: number = 50;

  protected lastTimingSample?: number;
  protected samples = new Series.Sampled([this.defaultPulseDelay], 25);
  protected deviation = new StdDev.Deviation<Series.Sampled>(this.samples, 0);
  protected median = new StdDev.Median<Series.Sampled>(this.samples, this.defaultPulseDelay);

  public callbackTimingSample(timingMS: number) {
    const lastTimingSample = this.lastTimingSample;

    // always update the last sample
    this.lastTimingSample = timingMS;

    if (lastTimingSample !== undefined) {
      // assert timingMS > lastTimingSample, and that it's relative to
      // how long the document is open; this should be perfect for the
      // timeStamp of any Event callback.
      const eventDelay = timingMS - lastTimingSample;

      this.samples.sample(eventDelay);
      this.deviation.nextTerm(eventDelay);
      this.median.nextTerm(eventDelay);
    }
  }

  get pulseDelay(): number {
    // dynamic intervals require setTimeout() and resetting on each call;
    // assert that the median time between API event callbacks is a good
    // interval, and slow us down by a partial standard deviation.
    //
    // The additional delay gets longer with the number of ticks since an API
    // callback occurred. This is to keep standard reaction times fast, while
    // backing off if we happen to be too aggressive.
    let delay =
      Math.max(this.minPulseDelay, this.median.approximation);

    delay += 
      (Math.min(this.deviation.deviation, this.maxPulseDelay - delay) * Math.log2(this.tick + 3) / 10);

    // fall back to default delay time iff somehow the math failed - which
    // it does sometimes if deviation hasn't been calculated yet.
    return Number.isNaN(delay)
      ? this.defaultPulseDelay
      : Math.floor(Math.min(Math.max(delay, this.minPulseDelay), this.maxPulseDelay));
  }

  protected nextPulseAt?: number;
  protected currentPulseAt?: number;
  protected pulsarTimeoutID?: number;

  scheduleNextPulse(now: number = this.currentPulseAt ?? performance.now()) {
    const pulseDelay = this.pulseDelay;
    this.nextPulseAt = now + pulseDelay;
    this.interval.number = pulseDelay;
  }

  pulsar = () => {
    this.scheduleNextPulse();

    // this will trigger 'tick' events on updates, which may further
    // trigger longer, async processing.
    this.tick++;
  }

  resetPulsar = () => {
    let nextPulseAt = this.nextPulseAt;
    this.nextPulseAt = undefined;

    if (nextPulseAt === undefined) {
      return;
    }

    this.currentPulseAt = nextPulseAt;

    if (this.pulsarTimeoutID !== undefined) {
      window.clearTimeout(this.pulsarTimeoutID);
      this.pulsarTimeoutID = undefined;
    }

    let timeUntilPulse = Math.max(nextPulseAt - performance.now(), this.minPulseDelay);

    // don't go too fast - also filter NaNs, or negative values, which may
    // arise when the browser is hogged down, since we're fresh out of
    // Tachyons.
    if (Number.isNaN(timeUntilPulse)) {
      timeUntilPulse = this.minPulseDelay;
    }

    // ensure to pulse at the projected time, or at least close to it
    this.pulsarTimeoutID = window.setTimeout(this.pulsar, timeUntilPulse);
  }

  pulsarIntervalID = window.setInterval(this.resetPulsar, this.resetPulsarInterval);
}

customElements.define('caption-ticker', Ticker, { extends: 'p' });
