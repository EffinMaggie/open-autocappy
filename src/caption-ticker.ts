/** @format */

import { OExplicitNodeUpdater } from './dom-manipulation.js';

export class Ticker extends HTMLParagraphElement {
  constructor() {
    super();

    console.log('new ticker created', this);
  }

  get ticks(): number {
    return Number(this.getAttribute('data-ticks'));
  }

  set ticks(n: number) {
    if (n >= 0) {
      this.setAttribute('data-ticks', n.toString());
    }
  }
}

customElements.define('caption-ticker', Ticker, { extends: 'p' });
