/** @format */

import { OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { CompareResult, PartialOrder, QValue, OuterHull } from './qualified.js';
import { DateBetween } from './dated.js';

export class Branch extends HTMLSpanElement implements PartialOrder {
  constructor(
    when: DateBetween,
    confidence: QValue,
    final: boolean = false,
    text: string = '',
    source: string = '',
    language: string = ''
  ) {
    super();
    this.setAttribute('is', 'caption-branch');

    this.when = when;
    this.confidence = confidence;
    this.final = final;
    this.text = text;
    this.source = source;
    this.language = language;
  }

  private accessors = {
    classes: new OExplicitNodeUpdater(this, 'class', ''),
    confidence: new OExplicitNodeUpdater(this, 'data-confidence', '-1'),
    when: new OExplicitNodeUpdater(this, 'data-when', ''),
    source: new OExplicitNodeUpdater(this, 'data-source', ''),
    lang: new OExplicitNodeUpdater(this, 'lang', ''),
    text: new OExplicitNodeUpdater(this, undefined, ''),
  };

  private model = {
    classes: new Access.Classes(this.accessors.classes),
    confidence: new Access.Numeric(this.accessors.confidence),
    when: new Access.Storage(this.accessors.when),
    source: new Access.Storage(this.accessors.source),
    language: new Access.Storage(this.accessors.lang),
    text: new Access.Storage(this.accessors.text),
  };

  get confidence(): QValue {
    return new QValue(this.model.confidence.number);
  }

  set confidence(q: QValue) {
    this.model.confidence.number = q.value;
  }

  get when(): DateBetween {
    return new DateBetween(DateBetween.diffcat(this.accessors.when.string));
  }

  set when(when: DateBetween) {
    this.accessors.when.string = when.string;
  }

  get final(): boolean {
    return this.model.classes.has('final');
  }

  set final(final: boolean) {
    if (final) {
      this.model.classes.modify(['interim'], ['final']);
    } else {
      this.model.classes.modify(['final'], ['interim']);
    }
  }

  get interim(): boolean {
    return !this.final;
  }

  set interim(interim: boolean) {
    this.final = !interim;
  }

  get source(): string {
    return this.model.source.string;
  }

  set source(source: string) {
    this.model.source.string = source;
  }

  get language(): string {
    return this.model.language.string;
  }

  set language(language: string) {
    this.model.language.string = language;
  }

  get text(): string {
    return this.model.text.string;
  }

  set text(text: string) {
    this.model.text.string = text;
  }

  compare(b: Branch): CompareResult {
    const q = this.confidence.compare(b.confidence);
    const w = this.when.compare(b.when);

    return w || q;
  }
}

customElements.define('caption-branch', Branch, { extends: 'span' });
