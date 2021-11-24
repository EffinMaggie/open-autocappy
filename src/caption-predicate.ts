/** @format */

import { predicate, listeners, action, actions } from './declare-events.js';
import { OExplicitNodeUpdater, Access } from './dom-manipulation.js';

export class CaptionPredicate extends HTMLLIElement {
  public constructor(public readonly predicate: predicate, name: string, text: string = '█') {
    super();
    this.setAttribute('is', 'caption-predicate');

    this.active = predicate.ok();
    this.name = name;
    this.text = text;
  }

  private accessors = {
    classes: new OExplicitNodeUpdater(this, 'class', ''),
    name: new OExplicitNodeUpdater(this, 'data-name', ''),

    text: new OExplicitNodeUpdater(this, undefined, ''),
  };

  private model = {
    classes: new Access.Classes(this.accessors.classes),
    name: new Access.Storage(this.accessors.name),

    text: new Access.Storage(this.accessors.text),
  };

  get active(): boolean {
    const active: boolean = this.model.classes.has('active');
    if (this.predicate.ok() != active) {
      this.active = !active;
      return !active;
    }
    return active;
  }

  set active(active: boolean) {
    if (active) {
      this.model.classes.modify(['end'], ['active']);
    } else {
      this.model.classes.modify(['active'], ['end']);
    }
  }

  get name(): string {
    return this.model.name.string;
  }

  set name(name: string) {
    this.model.name.string = name;
  }

  get text(): string {
    return this.model.text.string;
  }

  set text(text: string) {
    this.model.text.string = text;
  }

  protected sync = () => {
    this.active = this.predicate.ok();
  };

  private readonly weave = new listeners(
    [this.predicate],
    new actions([action.make(this.sync, 'sync').upon(['value-changed'])])
  );

  private readonly enabled = (this.weave.on = true);
}

customElements.define('caption-predicate', CaptionPredicate, { extends: 'li' });
