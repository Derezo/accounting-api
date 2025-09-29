import Decimal from 'decimal.js';

/**
 * Financial utility functions for precise decimal arithmetic
 *
 * All monetary calculations should use these utilities to ensure
 * proper precision and avoid floating-point errors.
 */

// Configure Decimal.js for financial precision
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
  minE: -9e15,
  maxE: 9e15
});

export class FinancialMath {
  /**
   * Create a new Decimal from various input types
   */
  static decimal(value: string | number | Decimal): Decimal {
    return new Decimal(value);
  }

  /**
   * Add two values with financial precision
   */
  static add(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).plus(new Decimal(b));
  }

  /**
   * Subtract two values with financial precision
   */
  static subtract(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).minus(new Decimal(b));
  }

  /**
   * Multiply two values with financial precision
   */
  static multiply(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).times(new Decimal(b));
  }

  /**
   * Divide two values with financial precision
   */
  static divide(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).dividedBy(new Decimal(b));
  }

  /**
   * Calculate percentage with proper precision
   * @param value The value to calculate percentage of
   * @param percentage The percentage (e.g., 15 for 15%)
   * @returns The percentage amount
   */
  static percentage(value: string | number | Decimal, percentage: string | number | Decimal): Decimal {
    return new Decimal(value).times(new Decimal(percentage)).dividedBy(100);
  }

  /**
   * Calculate percentage ratio between two values
   * @param numerator The numerator value
   * @param denominator The denominator value
   * @returns The percentage (e.g., 15.5 for 15.5%)
   */
  static percentageRatio(numerator: string | number | Decimal, denominator: string | number | Decimal): Decimal {
    if (new Decimal(denominator).isZero()) {
      return new Decimal(0);
    }
    return new Decimal(numerator).dividedBy(new Decimal(denominator)).times(100);
  }

  /**
   * Round to currency precision (2 decimal places)
   */
  static toCurrency(value: string | number | Decimal): Decimal {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Round to percentage precision (4 decimal places)
   */
  static toPercentage(value: string | number | Decimal): Decimal {
    return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  /**
   * Calculate tax amount with proper precision
   * @param baseAmount The amount to calculate tax on
   * @param taxRate The tax rate as percentage (e.g., 13.5 for 13.5%)
   * @returns Tax amount rounded to currency precision
   */
  static calculateTax(baseAmount: string | number | Decimal, taxRate: string | number | Decimal): Decimal {
    const taxAmount = this.percentage(baseAmount, taxRate);
    return this.toCurrency(taxAmount);
  }

  /**
   * Calculate compound tax (like Quebec QST on GST+amount)
   * @param baseAmount The base amount
   * @param firstTaxRate First tax rate (e.g., GST)
   * @param secondTaxRate Second tax rate (e.g., QST)
   * @returns Object with individual tax amounts and total
   */
  static calculateCompoundTax(
    baseAmount: string | number | Decimal,
    firstTaxRate: string | number | Decimal,
    secondTaxRate: string | number | Decimal
  ): { firstTax: Decimal; secondTax: Decimal; totalTax: Decimal } {
    const firstTax = this.calculateTax(baseAmount, firstTaxRate);
    const taxableForSecond = this.add(baseAmount, firstTax);
    const secondTax = this.calculateTax(taxableForSecond, secondTaxRate);
    const totalTax = this.add(firstTax, secondTax);

    return {
      firstTax: this.toCurrency(firstTax),
      secondTax: this.toCurrency(secondTax),
      totalTax: this.toCurrency(totalTax)
    };
  }

  /**
   * Calculate financial ratios with proper precision
   * @param numerator Numerator value
   * @param denominator Denominator value
   * @returns Ratio as percentage with 4 decimal places
   */
  static calculateRatio(numerator: string | number | Decimal, denominator: string | number | Decimal): Decimal {
    if (new Decimal(denominator).isZero()) {
      return new Decimal(0);
    }
    const ratio = FinancialMath.percentageRatio(numerator, denominator);
    return FinancialMath.toPercentage(ratio);
  }

  /**
   * Sum an array of values with financial precision
   */
  static sum(values: (string | number | Decimal)[]): Decimal {
    return values.reduce((acc: Decimal, value) => acc.plus(new Decimal(value)), new Decimal(0));
  }

  /**
   * Calculate average of an array of values
   */
  static average(values: (string | number | Decimal)[]): Decimal {
    if (values.length === 0) return new Decimal(0);
    const total = this.sum(values);
    return total.dividedBy(values.length);
  }

  /**
   * Convert Decimal to number for database storage
   * WARNING: Only use when storing in Prisma Decimal fields
   */
  static toNumber(value: Decimal): number {
    return value.toNumber();
  }

  /**
   * Convert Decimal to string for JSON serialization
   */
  static toString(value: Decimal): string {
    return value.toString();
  }

  /**
   * Check if value is zero
   */
  static isZero(value: string | number | Decimal): boolean {
    return new Decimal(value).isZero();
  }

  /**
   * Check if value is positive
   */
  static isPositive(value: string | number | Decimal): boolean {
    return new Decimal(value).isPositive();
  }

  /**
   * Check if value is negative
   */
  static isNegative(value: string | number | Decimal): boolean {
    return new Decimal(value).isNegative();
  }

  /**
   * Get absolute value
   */
  static abs(value: string | number | Decimal): Decimal {
    return new Decimal(value).abs();
  }

  /**
   * Compare two values
   * @returns -1 if a < b, 0 if a === b, 1 if a > b
   */
  static compare(a: string | number | Decimal, b: string | number | Decimal): number {
    return new Decimal(a).comparedTo(new Decimal(b));
  }

  /**
   * Get the maximum of two values
   */
  static max(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).greaterThan(new Decimal(b)) ? new Decimal(a) : new Decimal(b);
  }

  /**
   * Get the minimum of two values
   */
  static min(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).lessThan(new Decimal(b)) ? new Decimal(a) : new Decimal(b);
  }
}

// Export commonly used functions for convenience
export const {
  decimal,
  add,
  subtract,
  multiply,
  divide,
  percentage,
  percentageRatio,
  toCurrency,
  toPercentage,
  calculateTax,
  calculateCompoundTax,
  calculateRatio,
  sum,
  average,
  toNumber,
  toString,
  isZero,
  isPositive,
  isNegative,
  abs,
  compare,
  max,
  min
} = FinancialMath;