import { Response } from 'express';
import { _BaseAssert } from './_base-assert';

export class AssertString extends _BaseAssert {
  constructor(res: Response, value: any, field: string, public override isOk: boolean) {
    super(res, value, field);
  }

  maxLength(length: number) {
    if (!this.isOk) return this;
    if (this.value.length > length) {
      this.res.status(400).json({
        success: false,
        error: 'TOO_LONG',
        field: this.field,
        gotLength: this.value.length,
        expected: `<= ${length}`,
      });
      this.isOk = false;
    }
    return this;
  }
  minLength(length: number) {
    if (!this.isOk) return this;
    if (this.value.length < length) {
      this.res.status(400).json({
        success: false,
        error: 'TOO_SHORT',
        field: this.field,
        gotLength: this.value.length,
        expected: `>= ${length}`,
      });
      this.isOk = false;
    }
    return this;
  }
  exactLength(length: number) {
    if (!this.isOk) return this;
    if (this.value.length < length) {
      this.res.status(400).json({
        success: false,
        error: 'WRONG_LENGTH',
        field: this.field,
        gotLength: this.value.length,
        expected: length,
      });
      this.isOk = false;
    }
    return this;
  }
  match(regex: RegExp) {
    if (!this.isOk) return this;
    if (!this.value.match(regex)) {
      this.res.status(400).json({
        success: false,
        error: 'PATTERN_EXPECTED',
        field: this.field,
        got: this.value,
        expected: regex,
      });
      this.isOk = false;
    }
    return this;
  }
}
