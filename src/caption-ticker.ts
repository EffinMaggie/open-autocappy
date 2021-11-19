/** @format */

import { Series, StdDev } from './streaming.js';
import { OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import {
  action,
  actions,
  listeners,
  poke,
} from './declare-events.js';

export class Ticker extends HTMLParagraphElement {
  constructor() {
    super();

    this.scheduleNextPulse();
  }

  private accessors = {
    ticks: new OExplicitNodeUpdater(this),
    interval: new OExplicitNodeUpdater(this, 'data-interval', '500 ms'),
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

  protected readonly defaultPulseDelay: number = 500;
  protected readonly minPulseDelay: number = 50;
  protected readonly maxPulseDelay: number = 2500;
  protected readonly resetPulsarInterval: number = 100;

  protected lastTimingSample?: number;
  protected samples = new Series.Sampled([this.defaultPulseDelay], 25);
  protected deviation = new StdDev.Deviation<Series.Sampled>(this.samples, this.defaultPulseDelay);

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
    }
  }

  get pulseDelay(): number {
    // dynamic intervals require setTimeout() and resetting on each call;
    // assert that the mean time between API event callbacks is a good
    // interval, and slow us down by a partial standard deviation.
    //
    // the fraction applied to the deviation ranges from .25 to 6, scaling
    // linearly with ticks in range 0 to 100 - this allows for very fast
    // responses while the API is very actively talking with us, but a
    // gradual decay in load for zombie or recovery cases, to give the
    // browser some breathing room.
    const delay =
        Math.max(this.minPulseDelay, this.deviation.average) +
        (this.deviation.deviation * (0.25 + this.tick * 5.75)) / 100;

    // fall back to default delay time iff somehow the math failed - which
    // it does sometimes if deviation hasn't been calculated yet.
    return isNaN(delay) ? this.defaultPulseDelay : Math.min(Math.max(delay, this.minPulseDelay), this.maxPulseDelay);
  }

  protected nextPulseAt?: number;
  protected pulsarTimeoutID?: number;

  scheduleNextPulse() {
    const pulseDelay = this.pulseDelay;
    this.nextPulseAt = performance.now() + pulseDelay;
    this.interval.number = pulseDelay;
  }

  pulsar() {
    this.scheduleNextPulse();

    // this will trigger 'tick' events on updates, which may further
    // trigger longer, async processing.
    this.tick++;
  }

  boundPulsar = this.pulsar.bind(this);

  resetPulsar() {
    let nextPulseAt = this.nextPulseAt;
    this.nextPulseAt = undefined;

    if (nextPulseAt === undefined) {
      return;
    }

    if (this.pulsarTimeoutID !== undefined) {
      window.clearTimeout(this.pulsarTimeoutID);
      this.pulsarTimeoutID = undefined;
    }

    let timeUntilPulse = nextPulseAt - performance.now();

    // don't go too fast - also filter NaNs, or negative values, which may
    // arise when the browser is hogged down, since we're fresh out of
    // Tachyons.
    if (!(timeUntilPulse > this.minPulseDelay)) {
      timeUntilPulse = this.minPulseDelay;
    }

    // ensure to pulse at the projected time, or at least close to it
    this.pulsarTimeoutID = window.setTimeout(this.boundPulsar, timeUntilPulse);
  }

  boundResetPulsar = this.resetPulsar.bind(this);

  pulsarIntervalID = window.setInterval(this.boundResetPulsar, this.resetPulsarInterval);
}

customElements.define('caption-ticker', Ticker, { extends: 'p' });
