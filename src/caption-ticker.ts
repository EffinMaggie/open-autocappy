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
  protected readonly minPulseDelay: number = 50;
  protected readonly maxPulseDelay: number = 300;
  protected readonly resetPulsarInterval: number = 65;

  protected lastTimingSample?: number;
  protected samples = new Series.Sampled([this.defaultPulseDelay], 25);
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
      this.median.nextTerm(eventDelay);
    }
  }

  get pulseDelay(): number {
    // dynamic intervals require setTimeout() and resetting on each call;
    // assert that the median time between API event callbacks is a good
    // interval.
    let delay = this.median.approximation;

    if (Number.isNaN(delay) || delay < this.minPulseDelay) {
      delay = this.minPulseDelay;
    }

    if (delay > this.maxPulseDelay) {
      delay = this.maxPulseDelay;
    }

    return delay;
  }

  protected nextPulseAt?: number;
  protected pulsarTimeoutID?: number;

  scheduleNextPulse(now: number = performance.now()) {
    // don't change the schedule if we already have a time set.
    if (this.nextPulseAt && this.nextPulseAt > now) {
      return;
    }

    const pulseDelay = this.pulseDelay;

    this.nextPulseAt = now + pulseDelay;
    this.interval.number = pulseDelay;
  }

  pulsar = () => {
    // don't try to cancel this callback, we're running.
    this.pulsarTimeoutID = undefined;

    this.scheduleNextPulse();

    // this will trigger 'tick' events on updates, which may further
    // trigger longer, async processing.
    this.tick++;
  };

  resetPulsar = () => {
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
    if (Number.isNaN(timeUntilPulse) || timeUntilPulse < this.minPulseDelay) {
      timeUntilPulse = this.minPulseDelay;
    } else if (timeUntilPulse > this.maxPulseDelay) {
      timeUntilPulse = this.maxPulseDelay;
    }

    // ensure to pulse at the projected time, or at least close to it
    this.pulsarTimeoutID = window.setTimeout(this.pulsar, timeUntilPulse);
  };

  pulsarIntervalID = window.setInterval(this.resetPulsar, this.resetPulsarInterval);
}

customElements.define('caption-ticker', Ticker, { extends: 'p' });
