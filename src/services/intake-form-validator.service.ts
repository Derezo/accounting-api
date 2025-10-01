/**
 * IntakeFormValidatorService
 * Handles dynamic validation of form fields based on template rules
 */

import {
  FieldType,
  DataType,
  ValidationRules,
  ConditionalLogic,
  FieldDto,
} from '@/types/intake-form-template.types';
import { ValidationError } from '@/utils/errors';

export interface FieldValidationResult {
  field: string;
  valid: boolean;
  errors: string[];
}

export interface FormValidationResult {
  valid: boolean;
  fields: Record<string, FieldValidationResult>;
  errors: Array<{ field: string; message: string }>;
}

export class IntakeFormValidatorService {
  /**
   * Validate all fields in form data
   */
  validateFormData(
    fields: FieldDto[],
    formData: Record<string, unknown>
  ): FormValidationResult {
    const results: Record<string, FieldValidationResult> = {};
    const errors: Array<{ field: string; message: string }> = [];

    for (const field of fields) {
      // Check if field should be shown based on conditional logic
      if (field.showIf && !this.evaluateCondition(field.showIf, formData)) {
        continue; // Skip validation for hidden fields
      }

      // Check if field is required (base requirement or conditional)
      const isRequired =
        field.isRequired ||
        (field.requireIf && this.evaluateCondition(field.requireIf, formData));

      const value = formData[field.fieldKey];
      const fieldResult = this.validateField(field, value, isRequired || false);

      results[field.fieldKey] = fieldResult;

      if (!fieldResult.valid) {
        fieldResult.errors.forEach((error) => {
          errors.push({
            field: field.fieldKey,
            message: error,
          });
        });
      }
    }

    return {
      valid: errors.length === 0,
      fields: results,
      errors,
    };
  }

  /**
   * Validate a single field
   */
  validateField(
    field: FieldDto,
    value: unknown,
    isRequired: boolean
  ): FieldValidationResult {
    const errors: string[] = [];

    // Check required
    if (isRequired && this.isEmpty(value)) {
      errors.push(
        field.validationError || `${field.label} is required`
      );
      return {
        field: field.fieldKey,
        valid: false,
        errors,
      };
    }

    // Skip further validation if value is empty and not required
    if (this.isEmpty(value)) {
      return {
        field: field.fieldKey,
        valid: true,
        errors: [],
      };
    }

    // Type-specific validation
    const typeErrors = this.validateFieldType(field.fieldType, value);
    errors.push(...typeErrors);

    // Custom validation rules
    if (field.validationRules) {
      const ruleErrors = this.validateRules(
        field.validationRules,
        value,
        field.label
      );
      errors.push(...ruleErrors);
    }

    return {
      field: field.fieldKey,
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate field type
   */
  private validateFieldType(fieldType: string, value: unknown): string[] {
    const errors: string[] = [];

    switch (fieldType as FieldType) {
      case FieldType.EMAIL:
        if (!this.isValidEmail(value as string)) {
          errors.push('Invalid email address');
        }
        break;

      case FieldType.PHONE:
        if (!this.isValidPhone(value as string)) {
          errors.push('Invalid phone number');
        }
        break;

      case FieldType.NUMBER:
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push('Must be a valid number');
        }
        break;

      case FieldType.DATE:
      case FieldType.DATETIME:
        if (!this.isValidDate(value)) {
          errors.push('Invalid date');
        }
        break;

      case FieldType.CHECKBOX:
        if (typeof value !== 'boolean') {
          errors.push('Must be true or false');
        }
        break;

      case FieldType.MULTISELECT:
        if (!Array.isArray(value)) {
          errors.push('Must be an array');
        }
        break;

      case FieldType.FILE:
        if (typeof value !== 'string' && !this.isFileObject(value)) {
          errors.push('Invalid file');
        }
        break;

      // TEXT, TEXTAREA, SELECT, RADIO, etc. accept strings
      default:
        break;
    }

    return errors;
  }

  /**
   * Validate custom rules
   */
  private validateRules(
    rules: ValidationRules,
    value: unknown,
    fieldLabel: string
  ): string[] {
    const errors: string[] = [];

    // Min/max for numbers
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${fieldLabel} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${fieldLabel} must be at most ${rules.max}`);
      }
    }

    // Min/max length for strings
    if (typeof value === 'string') {
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        errors.push(
          `${fieldLabel} must be at least ${rules.minLength} characters`
        );
      }
      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        errors.push(
          `${fieldLabel} must be at most ${rules.maxLength} characters`
        );
      }

      // Pattern matching
      if (rules.pattern) {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(value)) {
          errors.push(`${fieldLabel} format is invalid`);
        }
      }
    }

    // Email validation
    if (rules.email && !this.isValidEmail(value as string)) {
      errors.push('Invalid email address');
    }

    // Phone validation
    if (rules.phone && !this.isValidPhone(value as string)) {
      errors.push('Invalid phone number');
    }

    // URL validation
    if (rules.url && !this.isValidUrl(value as string)) {
      errors.push('Invalid URL');
    }

    return errors;
  }

  /**
   * Evaluate conditional logic
   */
  evaluateCondition(
    condition: ConditionalLogic,
    formData: Record<string, unknown>
  ): boolean {
    if (!condition.conditions || condition.conditions.length === 0) {
      return true;
    }

    const results = condition.conditions.map((cond) => {
      const fieldValue = formData[cond.field];
      return this.evaluateOperator(
        cond.operator,
        fieldValue,
        cond.value
      );
    });

    // Combine results based on operator
    if (condition.operator === 'AND') {
      return results.every((r) => r === true);
    } else {
      // OR
      return results.some((r) => r === true);
    }
  }

  /**
   * Evaluate comparison operator
   */
  private evaluateOperator(
    operator: string,
    fieldValue: unknown,
    compareValue: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === compareValue;

      case 'notEquals':
        return fieldValue !== compareValue;

      case 'contains':
        if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
          return fieldValue.includes(compareValue);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(compareValue);
        }
        return false;

      case 'notContains':
        if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
          return !fieldValue.includes(compareValue);
        }
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(compareValue);
        }
        return true;

      case 'greaterThan':
        return Number(fieldValue) > Number(compareValue);

      case 'lessThan':
        return Number(fieldValue) < Number(compareValue);

      case 'in':
        if (Array.isArray(compareValue)) {
          return compareValue.includes(fieldValue);
        }
        return false;

      case 'notIn':
        if (Array.isArray(compareValue)) {
          return !compareValue.includes(fieldValue);
        }
        return true;

      case 'isEmpty':
        return this.isEmpty(fieldValue);

      case 'isNotEmpty':
        return !this.isEmpty(fieldValue);

      default:
        return false;
    }
  }

  // ==================== VALIDATION HELPERS ====================

  private isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return true;
    }
    if (Array.isArray(value) && value.length === 0) {
      return true;
    }
    return false;
  }

  private isValidEmail(email: string): boolean {
    if (typeof email !== 'string') {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    if (typeof phone !== 'string') {
      return false;
    }
    // Remove common formatting characters
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    // Check if it's a valid number with 10-15 digits
    const phoneRegex = /^\d{10,15}$/;
    return phoneRegex.test(cleaned);
  }

  private isValidUrl(url: string): boolean {
    if (typeof url !== 'string') {
      return false;
    }
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidDate(value: unknown): boolean {
    if (value instanceof Date) {
      return !isNaN(value.getTime());
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
    return false;
  }

  private isFileObject(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const file = value as Record<string, unknown>;
    return (
      typeof file.filename === 'string' &&
      typeof file.mimetype === 'string' &&
      typeof file.size === 'number'
    );
  }

  /**
   * Sanitize form data based on field types
   */
  sanitizeFormData(
    fields: FieldDto[],
    formData: Record<string, unknown>
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const field of fields) {
      const value = formData[field.fieldKey];

      if (value === undefined || value === null) {
        continue;
      }

      // Sanitize based on field type
      switch (field.fieldType as FieldType) {
        case FieldType.TEXT:
        case FieldType.TEXTAREA:
        case FieldType.EMAIL:
          sanitized[field.fieldKey] = this.sanitizeString(value as string);
          break;

        case FieldType.PHONE:
          sanitized[field.fieldKey] = this.sanitizePhone(value as string);
          break;

        case FieldType.NUMBER:
          sanitized[field.fieldKey] = Number(value);
          break;

        case FieldType.CHECKBOX:
          sanitized[field.fieldKey] = Boolean(value);
          break;

        case FieldType.DATE:
        case FieldType.DATETIME:
          sanitized[field.fieldKey] = this.sanitizeDate(value);
          break;

        case FieldType.MULTISELECT:
          if (Array.isArray(value)) {
            sanitized[field.fieldKey] = value.map((v) =>
              this.sanitizeString(String(v))
            );
          }
          break;

        default:
          sanitized[field.fieldKey] = value;
          break;
      }
    }

    return sanitized;
  }

  private sanitizeString(str: string): string {
    if (typeof str !== 'string') {
      return String(str);
    }
    // Trim whitespace
    let sanitized = str.trim();
    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');
    return sanitized;
  }

  private sanitizePhone(phone: string): string {
    if (typeof phone !== 'string') {
      return String(phone);
    }
    // Keep only digits, spaces, hyphens, parentheses, and plus sign
    return phone.replace(/[^\d\s\-\(\)\+]/g, '');
  }

  private sanitizeDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }
}
