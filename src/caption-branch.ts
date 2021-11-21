/** @format */

import { OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { CompareResult, PartialOrder, QValue, OuterHull } from './qualified.js';
import { DateBetween } from './dated.js';

import { Translations } from './translate-deepl.js';

export let TranslatedBranches: Branch[] = [];

export class Branch extends HTMLSpanElement implements PartialOrder {

  public constructor(
    when: DateBetween,
    confidence: QValue,
    final: boolean,
    text: string,
    source: string,
    language: string,
    error?: string,
  ) {
    super();
    this.setAttribute('is', 'caption-branch');

    this.when = when;
    this.confidence = confidence;
    this.final = final;
    this.text = text;
    this.source = source;
    this.language = language;
    this.error = error;

    if (final && Translations.Settings.enabled && language !== Translations.Settings.target) {
        Translations.translate(text, language).then(
          (translations: Iterable<Translations.LanguageString>) => {
            for (const translation of translations) {
              TranslatedBranches.push(Branch.makeTranslation(this.when, translation.text, 'deepl', translation.lang));
          }
          }
        );
    }
  }

  public static makeError(
    when: DateBetween,
    error: string,
    source: string,
    message: string = error
  ): Branch {
    return new Branch(when, new QValue(1.0), true, message, source, 'error-code', error);
  }

  public static makeTranslation(
    when: DateBetween,
    text: string,
    source: string,
    language: string,
  ): Branch {
    return new Branch(when, new QValue(1.0), true, text, source, language);
  }

  private accessors = {
    classes: new OExplicitNodeUpdater(this, 'class', ''),
    confidence: new OExplicitNodeUpdater(this, 'data-confidence', '0'),
    when: new OExplicitNodeUpdater(this, 'data-when', ''),
    source: new OExplicitNodeUpdater(this, 'data-source', ''),
    lang: new OExplicitNodeUpdater(this, 'lang', ''),
    error: new OExplicitNodeUpdater(this, 'data-error', ''),

    text: new OExplicitNodeUpdater(this, undefined, ''),
  };

  private model = {
    classes: new Access.Classes(this.accessors.classes),
    confidence: new Access.Numeric(this.accessors.confidence),
    when: new Access.Storage(this.accessors.when),
    source: new Access.Storage(this.accessors.source),
    language: new Access.Storage(this.accessors.lang),
    error: new Access.Storage(this.accessors.error),

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

  get error(): string | undefined {
    return this.model.error.string || undefined;
  }

  set error(error: string | undefined) {
    this.model.error.string = error ?? '';

    if (error) {
      this.model.classes.modify(undefined, ['error']);
    } else {
      this.model.classes.modify(['error'], undefined);
    }
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
