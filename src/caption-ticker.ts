/** @format */

import { OExplicitNodeUpdater, Access } from './dom-manipulation.js';

export class Ticker extends HTMLParagraphElement {
  constructor() {
    super();

    console.log('new ticker created', this);
  }

  private accessors = {
    ticks: new OExplicitNodeUpdater(this, 'data-ticks', ''),
  };

  ticks = new Access.Numeric(this.accessors.ticks);
}

customElements.define('caption-ticker', Ticker, { extends: 'p' });
