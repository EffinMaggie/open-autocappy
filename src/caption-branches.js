export class Branch {
    compare(b) {
        // TODO: chaining multiple Qualified implementations really sounds like
        // something that should be a function composition... consider refactoring
        // into something that does this.
        var dc = this.when.compare(b.when);
        if (dc === 0) {
            dc = this.confidence.compare(b.confidence);
        }
        return dc;
    }
}
