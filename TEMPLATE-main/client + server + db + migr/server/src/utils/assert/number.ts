import { Response } from 'express';
import { _BaseAssert } from './_base-assert';

export class AssertNumber extends _BaseAssert {
  constructor(
    res: Response,
    value: any,
    field: string,
    public override isOk: boolean,
    readonly isStringNumber: boolean = false
  ) {
    super(res, value, field);
    this.value = isStringNumber ? Number(this.body?.[this.field]) : this.body?.[this.field];
  }

  isMoreThan(num: number, canBeEqual = true) {
    if (!this.isOk) return this;
    if (!(this.value > num || (canBeEqual && this.value === num))) {
      this.res.status(400).json({
        success: false,
        error: 'EXPECTED_MORE_THAN',
        field: this.field,
        got: this.value,
        expected: `>${canBeEqual ? '=' : ''} ${num}`,
      });
      this.isOk = false;
    }
    return this;
  }
  isLessThan(num: number, canBeEqual = true) {
    if (!this.isOk) return this;
    if (!(this.value < num || (canBeEqual && this.value === num))) {
      this.res.status(400).json({
        success: false,
        error: 'EXPECTED_LESS_THAN',
        field: this.field,
        got: this.value,
        expected: `<${canBeEqual ? '=' : ''} ${num}`,
      });
      this.isOk = false;
    }
    return this;
  }
  isBetween(min: number, max: number, canBeEqual = true) {
    if (!this.isOk) return this;
    if (!((this.value > min && this.value < max) || (canBeEqual && (this.value === min || this.value === max)))) {
      this.res.status(400).json({
        success: false,
        error: 'EXPECTED_BETWEEN',
        field: this.field,
        got: this.value,
        expected: `${min} <${canBeEqual ? '=' : ''} x <${canBeEqual ? '=' : ''} ${max}`,
      });
      this.isOk = false;
    }
    return this;
  }
  isInteger() {
    if (!this.isOk) return this;
    if (this.value % 1 !== 0) {
      this.res.status(400).json({ success: false, error: 'EXPECTED_INTEGER', field: this.field, got: this.value });
      this.isOk = false;
    }
    return this;
  }
}
