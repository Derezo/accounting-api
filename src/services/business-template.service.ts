import { BUSINESS_TEMPLATES, FieldTemplate, BusinessTemplate } from '../config/business-rules';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * BusinessTemplateService
 *
 * Handles dynamic form field templates for industry-specific intake workflows.
 * Provides template retrieval, field validation, and custom field merging.
 */
export class BusinessTemplateService {
  /**
   * Get all available business templates
   */
  public getAllTemplates(): Record<string, BusinessTemplate> {
    return BUSINESS_TEMPLATES;
  }

  /**
   * Get template for a specific category
   */
  public getTemplateForCategory(category: string): BusinessTemplate {
    const normalizedCategory = category.toUpperCase();

    if (!BUSINESS_TEMPLATES[normalizedCategory]) {
      throw new ValidationError(
        `Template not found for category: ${category}`,
        {
          category,
          availableCategories: Object.keys(BUSINESS_TEMPLATES)
        }
      );
    }

    return BUSINESS_TEMPLATES[normalizedCategory];
  }

  /**
   * Check if a category has a template
   */
  public hasTemplate(category: string): boolean {
    const normalizedCategory = category.toUpperCase();
    return normalizedCategory in BUSINESS_TEMPLATES;
  }

  /**
   * Get list of all available categories
   */
  public getAvailableCategories(): string[] {
    return Object.keys(BUSINESS_TEMPLATES);
  }

  /**
   * Get simplified template summary (without full field details)
   */
  public getTemplateSummaries(): Array<{
    category: string;
    name: string;
    description: string;
    fieldCount: number;
  }> {
    return Object.entries(BUSINESS_TEMPLATES).map(([category, template]) => ({
      category,
      name: template.name,
      description: template.description,
      fieldCount: template.fields.length
    }));
  }

  /**
   * Validate custom fields against template
   */
  public validateCustomFields(
    category: string,
    customFields: Record<string, any>
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const template = this.getTemplateForCategory(category);

      // Check each required field
      for (const field of template.fields) {
        if (field.required && !this.hasValue(customFields[field.name])) {
          errors.push(`Required field "${field.label}" (${field.name}) is missing`);
        }

        // Validate field if value provided
        if (this.hasValue(customFields[field.name])) {
          const fieldErrors = this.validateField(field, customFields[field.name]);
          errors.push(...fieldErrors);
        }
      }

      // Check for unknown fields (warning only)
      const templateFieldNames = template.fields.map(f => f.name);
      for (const fieldName of Object.keys(customFields)) {
        if (!templateFieldNames.includes(fieldName)) {
          warnings.push(`Unknown field "${fieldName}" provided (will be stored but not validated)`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error.message);
      } else {
        errors.push('Unknown validation error occurred');
        logger.error('Custom field validation error', { error, category });
      }

      return {
        isValid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Validate a single field value
   */
  private validateField(field: FieldTemplate, value: any): string[] {
    const errors: string[] = [];

    // Type-specific validation
    switch (field.type) {
      case 'number':
        if (typeof value !== 'number' && !this.isNumericString(value)) {
          errors.push(`Field "${field.label}" must be a number`);
          break;
        }
        const numValue = typeof value === 'number' ? value : parseFloat(value);
        if (field.min !== undefined && numValue < field.min) {
          errors.push(`Field "${field.label}" must be at least ${field.min}`);
        }
        if (field.max !== undefined && numValue > field.max) {
          errors.push(`Field "${field.label}" must be at most ${field.max}`);
        }
        break;

      case 'text':
      case 'textarea':
      case 'tel':
      case 'email':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.label}" must be a string`);
          break;
        }
        if (field.min !== undefined && value.length < field.min) {
          errors.push(`Field "${field.label}" must be at least ${field.min} characters`);
        }
        if (field.max !== undefined && value.length > field.max) {
          errors.push(`Field "${field.label}" must be at most ${field.max} characters`);
        }
        if (field.pattern) {
          const regex = new RegExp(field.pattern);
          if (!regex.test(value)) {
            errors.push(`Field "${field.label}" has invalid format`);
          }
        }
        if (field.type === 'email' && !this.isValidEmail(value)) {
          errors.push(`Field "${field.label}" must be a valid email address`);
        }
        break;

      case 'select':
      case 'radio':
        if (field.options && !field.options.includes(value)) {
          errors.push(
            `Field "${field.label}" must be one of: ${field.options.join(', ')}`
          );
        }
        break;

      case 'multiselect':
        if (!Array.isArray(value)) {
          errors.push(`Field "${field.label}" must be an array`);
          break;
        }
        if (field.options) {
          for (const item of value) {
            if (!field.options.includes(item)) {
              errors.push(
                `Field "${field.label}" contains invalid value "${item}". Must be one of: ${field.options.join(', ')}`
              );
            }
          }
        }
        break;

      case 'date':
        if (typeof value !== 'string' || !this.isValidDate(value)) {
          errors.push(`Field "${field.label}" must be a valid date (ISO 8601 format)`);
        }
        break;

      case 'checkbox':
        if (typeof value !== 'boolean') {
          errors.push(`Field "${field.label}" must be a boolean`);
        }
        break;
    }

    return errors;
  }

  /**
   * Check if a value exists (not null, undefined, or empty string)
   */
  private hasValue(value: any): boolean {
    return value !== null && value !== undefined && value !== '';
  }

  /**
   * Check if string is numeric
   */
  private isNumericString(value: any): boolean {
    if (typeof value !== 'string') return false;
    return !isNaN(parseFloat(value)) && isFinite(parseFloat(value));
  }

  /**
   * Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate date string (ISO 8601)
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Merge custom fields into intake quote data
   *
   * Converts custom fields object to JSON string for storage in database.
   */
  public mergeCustomFields(
    baseData: Record<string, any>,
    customFields: Record<string, any>
  ): Record<string, any> {
    return {
      ...baseData,
      customFields: JSON.stringify(customFields)
    };
  }

  /**
   * Parse custom fields from JSON string
   */
  public parseCustomFields(customFieldsJson: string | null): Record<string, any> | null {
    if (!customFieldsJson) {
      return null;
    }

    try {
      return JSON.parse(customFieldsJson);
    } catch (error) {
      logger.error('Failed to parse custom fields JSON', { error, customFieldsJson });
      return null;
    }
  }

  /**
   * Get fields that should be visible based on conditional logic
   *
   * Evaluates showIf conditions to determine which fields should be displayed
   */
  public getVisibleFields(
    template: BusinessTemplate,
    currentValues: Record<string, any>
  ): FieldTemplate[] {
    return template.fields.filter(field => {
      if (!field.showIf) {
        return true; // No condition, always visible
      }

      const conditionField = field.showIf.field;
      const conditionValue = field.showIf.value;
      const currentValue = currentValues[conditionField];

      // Check if condition is met
      if (Array.isArray(conditionValue)) {
        return conditionValue.includes(currentValue);
      } else {
        return currentValue === conditionValue;
      }
    });
  }

  /**
   * Extract custom field values formatted for display
   *
   * Useful for displaying custom field data in emails, PDFs, etc.
   */
  public formatCustomFieldsForDisplay(
    category: string,
    customFields: Record<string, any>
  ): Array<{ label: string; value: string; name: string }> {
    try {
      const template = this.getTemplateForCategory(category);
      const formatted: Array<{ label: string; value: string; name: string }> = [];

      for (const field of template.fields) {
        const value = customFields[field.name];
        if (this.hasValue(value)) {
          formatted.push({
            label: field.label,
            value: this.formatFieldValue(field, value),
            name: field.name
          });
        }
      }

      return formatted;
    } catch (error) {
      logger.error('Failed to format custom fields for display', { error, category });
      return [];
    }
  }

  /**
   * Format a field value for human-readable display
   */
  private formatFieldValue(field: FieldTemplate, value: any): string {
    if (value === null || value === undefined) {
      return 'Not provided';
    }

    switch (field.type) {
      case 'multiselect':
        return Array.isArray(value) ? value.join(', ') : String(value);
      case 'date':
        try {
          return new Date(value).toLocaleDateString();
        } catch {
          return String(value);
        }
      case 'checkbox':
        return value ? 'Yes' : 'No';
      case 'number':
        return String(value);
      default:
        return String(value);
    }
  }

  /**
   * Get field by name from template
   */
  public getFieldByName(category: string, fieldName: string): FieldTemplate | null {
    try {
      const template = this.getTemplateForCategory(category);
      return template.fields.find(f => f.name === fieldName) || null;
    } catch {
      return null;
    }
  }

  /**
   * Sanitize custom fields (remove dangerous content)
   *
   * Basic security measure to prevent XSS and injection attacks
   */
  public sanitizeCustomFields(customFields: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(customFields)) {
      if (typeof value === 'string') {
        // Basic HTML entity encoding for strings
        sanitized[key] = value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;');
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item =>
          typeof item === 'string' ? this.sanitizeString(item) : item
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize a single string value
   */
  private sanitizeString(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
}

export const businessTemplateService = new BusinessTemplateService();