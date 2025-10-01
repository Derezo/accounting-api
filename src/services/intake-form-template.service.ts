/**
 * IntakeFormTemplateService
 * Manages intake form templates, steps, fields, and transitions
 */

import { PrismaClient } from '@prisma/client';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateStepDto,
  UpdateStepDto,
  CreateFieldDto,
  UpdateFieldDto,
  CreateTransitionDto,
  UpdateTransitionDto,
  TemplateWithRelations,
  StepWithFields,
} from '@/types/intake-form-template.types';
import { NotFoundError, ValidationError } from '@/utils/errors';

export class IntakeFormTemplateService {
  constructor(private prisma: PrismaClient) {}

  // ==================== TEMPLATE MANAGEMENT ====================

  /**
   * Create a new intake form template
   */
  async createTemplate(
    organizationId: string,
    data: CreateTemplateDto
  ): Promise<TemplateWithRelations> {
    // Check if template with same name exists
    const existing = await this.prisma.intakeFormTemplate.findFirst({
      where: {
        organizationId,
        name: data.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ValidationError(
        `Template with name "${data.name}" already exists`
      );
    }

    const template = await this.prisma.intakeFormTemplate.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        templateType: data.templateType || 'CUSTOM',
        industry: data.industry,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
        isPublic: data.isPublic ?? false,
        config: JSON.stringify(data.config || {}),
        completionRules: JSON.stringify(data.completionRules || {}),
        autoConvert: data.autoConvert ?? false,
        conversionSettings: data.conversionSettings
          ? JSON.stringify(data.conversionSettings)
          : null,
      },
      include: {
        steps: {
          include: {
            fields: true,
            transitions: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        fields: true,
      },
    });

    return this.mapTemplateToDto(template);
  }

  /**
   * Get template by ID
   */
  async getTemplateById(
    organizationId: string,
    templateId: string
  ): Promise<TemplateWithRelations> {
    const template = await this.prisma.intakeFormTemplate.findFirst({
      where: {
        id: templateId,
        organizationId,
        deletedAt: null,
      },
      include: {
        steps: {
          include: {
            fields: {
              orderBy: { sortOrder: 'asc' },
            },
            transitions: {
              orderBy: { priority: 'desc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    return this.mapTemplateToDto(template);
  }

  /**
   * List all templates for an organization
   */
  async listTemplates(organizationId: string): Promise<TemplateWithRelations[]> {
    const templates = await this.prisma.intakeFormTemplate.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      include: {
        steps: {
          include: {
            fields: {
              orderBy: { sortOrder: 'asc' },
            },
            transitions: {
              orderBy: { priority: 'desc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((t) => this.mapTemplateToDto(t));
  }

  /**
   * Update a template
   */
  async updateTemplate(
    organizationId: string,
    templateId: string,
    data: UpdateTemplateDto
  ): Promise<TemplateWithRelations> {
    // Verify ownership
    await this.getTemplateById(organizationId, templateId);

    const template = await this.prisma.intakeFormTemplate.update({
      where: { id: templateId },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        isDefault: data.isDefault,
        config: data.config ? JSON.stringify(data.config) : undefined,
        completionRules: data.completionRules
          ? JSON.stringify(data.completionRules)
          : undefined,
        autoConvert: data.autoConvert,
        conversionSettings: data.conversionSettings
          ? JSON.stringify(data.conversionSettings)
          : undefined,
      },
      include: {
        steps: {
          include: {
            fields: {
              orderBy: { sortOrder: 'asc' },
            },
            transitions: {
              orderBy: { priority: 'desc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return this.mapTemplateToDto(template);
  }

  /**
   * Delete a template (soft delete)
   */
  async deleteTemplate(
    organizationId: string,
    templateId: string
  ): Promise<void> {
    // Verify ownership
    await this.getTemplateById(organizationId, templateId);

    await this.prisma.intakeFormTemplate.update({
      where: { id: templateId },
      data: { deletedAt: new Date() },
    });
  }

  // ==================== STEP MANAGEMENT ====================

  /**
   * Add a step to a template
   */
  async createStep(
    organizationId: string,
    templateId: string,
    data: CreateStepDto
  ): Promise<StepWithFields> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Check for duplicate step key
    const existing = await this.prisma.intakeFormStep.findFirst({
      where: {
        templateId,
        stepKey: data.stepKey,
      },
    });

    if (existing) {
      throw new ValidationError(
        `Step with key "${data.stepKey}" already exists in this template`
      );
    }

    const step = await this.prisma.intakeFormStep.create({
      data: {
        templateId,
        stepKey: data.stepKey,
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder,
        isRequired: data.isRequired ?? true,
        canSkip: data.canSkip ?? false,
        skipCondition: data.skipCondition
          ? JSON.stringify(data.skipCondition)
          : null,
        completionRules: data.completionRules
          ? JSON.stringify(data.completionRules)
          : null,
        layout: data.layout || 'SINGLE_COLUMN',
        displayStyle: data.displayStyle
          ? JSON.stringify(data.displayStyle)
          : null,
        helpText: data.helpText,
      },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
        transitions: {
          orderBy: { priority: 'desc' },
        },
      },
    });

    return this.mapStepToDto(step);
  }

  /**
   * Update a step
   */
  async updateStep(
    organizationId: string,
    templateId: string,
    stepId: string,
    data: UpdateStepDto
  ): Promise<StepWithFields> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Verify step belongs to template
    const existingStep = await this.prisma.intakeFormStep.findFirst({
      where: { id: stepId, templateId },
    });

    if (!existingStep) {
      throw new NotFoundError('Step not found in this template');
    }

    const step = await this.prisma.intakeFormStep.update({
      where: { id: stepId },
      data: {
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder,
        isRequired: data.isRequired,
        canSkip: data.canSkip,
        skipCondition: data.skipCondition
          ? JSON.stringify(data.skipCondition)
          : undefined,
        completionRules: data.completionRules
          ? JSON.stringify(data.completionRules)
          : undefined,
        layout: data.layout,
        displayStyle: data.displayStyle
          ? JSON.stringify(data.displayStyle)
          : undefined,
        helpText: data.helpText,
      },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
        transitions: {
          orderBy: { priority: 'desc' },
        },
      },
    });

    return this.mapStepToDto(step);
  }

  /**
   * Delete a step
   */
  async deleteStep(
    organizationId: string,
    templateId: string,
    stepId: string
  ): Promise<void> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Verify step belongs to template
    const existingStep = await this.prisma.intakeFormStep.findFirst({
      where: { id: stepId, templateId },
    });

    if (!existingStep) {
      throw new NotFoundError('Step not found in this template');
    }

    // Delete step (cascades to fields and transitions)
    await this.prisma.intakeFormStep.delete({
      where: { id: stepId },
    });
  }

  // ==================== FIELD MANAGEMENT ====================

  /**
   * Add a field to a template
   */
  async createField(
    organizationId: string,
    templateId: string,
    data: CreateFieldDto
  ): Promise<any> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // If stepId provided, verify it belongs to template
    if (data.stepId) {
      const step = await this.prisma.intakeFormStep.findFirst({
        where: { id: data.stepId, templateId },
      });

      if (!step) {
        throw new ValidationError('Invalid stepId for this template');
      }
    }

    // Check for duplicate field key
    const existing = await this.prisma.intakeFormField.findFirst({
      where: {
        templateId,
        fieldKey: data.fieldKey,
      },
    });

    if (existing) {
      throw new ValidationError(
        `Field with key "${data.fieldKey}" already exists in this template`
      );
    }

    const field = await this.prisma.intakeFormField.create({
      data: {
        templateId,
        stepId: data.stepId,
        fieldKey: data.fieldKey,
        label: data.label,
        placeholder: data.placeholder,
        helpText: data.helpText,
        fieldType: data.fieldType,
        dataType: data.dataType || 'string',
        isRequired: data.isRequired ?? false,
        validationRules: data.validationRules
          ? JSON.stringify(data.validationRules)
          : null,
        validationError: data.validationError,
        options: data.options ? JSON.stringify(data.options) : null,
        defaultValue: data.defaultValue
          ? JSON.stringify(data.defaultValue)
          : null,
        showIf: data.showIf ? JSON.stringify(data.showIf) : null,
        requireIf: data.requireIf ? JSON.stringify(data.requireIf) : null,
        sortOrder: data.sortOrder,
        width: data.width || 'FULL',
        displayStyle: data.displayStyle
          ? JSON.stringify(data.displayStyle)
          : null,
        autocomplete: data.autocomplete,
        mappingPath: data.mappingPath,
        encrypted: data.encrypted ?? false,
      },
    });

    return this.mapFieldToDto(field);
  }

  /**
   * Update a field
   */
  async updateField(
    organizationId: string,
    templateId: string,
    fieldId: string,
    data: UpdateFieldDto
  ): Promise<any> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Verify field belongs to template
    const existingField = await this.prisma.intakeFormField.findFirst({
      where: { id: fieldId, templateId },
    });

    if (!existingField) {
      throw new NotFoundError('Field not found in this template');
    }

    const field = await this.prisma.intakeFormField.update({
      where: { id: fieldId },
      data: {
        label: data.label,
        placeholder: data.placeholder,
        helpText: data.helpText,
        fieldType: data.fieldType,
        dataType: data.dataType,
        isRequired: data.isRequired,
        validationRules: data.validationRules
          ? JSON.stringify(data.validationRules)
          : undefined,
        validationError: data.validationError,
        options: data.options ? JSON.stringify(data.options) : undefined,
        defaultValue: data.defaultValue
          ? JSON.stringify(data.defaultValue)
          : undefined,
        showIf: data.showIf ? JSON.stringify(data.showIf) : undefined,
        requireIf: data.requireIf ? JSON.stringify(data.requireIf) : undefined,
        sortOrder: data.sortOrder,
        width: data.width,
        displayStyle: data.displayStyle
          ? JSON.stringify(data.displayStyle)
          : undefined,
        autocomplete: data.autocomplete,
        mappingPath: data.mappingPath,
        encrypted: data.encrypted,
      },
    });

    return this.mapFieldToDto(field);
  }

  /**
   * Delete a field
   */
  async deleteField(
    organizationId: string,
    templateId: string,
    fieldId: string
  ): Promise<void> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Verify field belongs to template
    const existingField = await this.prisma.intakeFormField.findFirst({
      where: { id: fieldId, templateId },
    });

    if (!existingField) {
      throw new NotFoundError('Field not found in this template');
    }

    await this.prisma.intakeFormField.delete({
      where: { id: fieldId },
    });
  }

  // ==================== TRANSITION MANAGEMENT ====================

  /**
   * Add a transition between steps
   */
  async createTransition(
    organizationId: string,
    templateId: string,
    data: CreateTransitionDto
  ): Promise<any> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Verify fromStep belongs to template
    const fromStep = await this.prisma.intakeFormStep.findFirst({
      where: { id: data.fromStepId, templateId },
    });

    if (!fromStep) {
      throw new ValidationError('Invalid fromStepId for this template');
    }

    const transition = await this.prisma.intakeFormTransition.create({
      data: {
        templateId,
        fromStepId: data.fromStepId,
        toStepKey: data.toStepKey,
        condition: data.condition ? JSON.stringify(data.condition) : null,
        priority: data.priority ?? 0,
        action: data.action ? JSON.stringify(data.action) : null,
        requirements: data.requirements
          ? JSON.stringify(data.requirements)
          : null,
      },
    });

    return this.mapTransitionToDto(transition);
  }

  /**
   * Update a transition
   */
  async updateTransition(
    organizationId: string,
    templateId: string,
    transitionId: string,
    data: UpdateTransitionDto
  ): Promise<any> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Verify transition exists
    const existing = await this.prisma.intakeFormTransition.findFirst({
      where: { id: transitionId },
      include: { fromStep: true },
    });

    if (!existing || existing.fromStep.templateId !== templateId) {
      throw new NotFoundError('Transition not found in this template');
    }

    const transition = await this.prisma.intakeFormTransition.update({
      where: { id: transitionId },
      data: {
        toStepKey: data.toStepKey,
        condition: data.condition ? JSON.stringify(data.condition) : undefined,
        priority: data.priority,
        action: data.action ? JSON.stringify(data.action) : undefined,
        requirements: data.requirements
          ? JSON.stringify(data.requirements)
          : undefined,
      },
    });

    return this.mapTransitionToDto(transition);
  }

  /**
   * Delete a transition
   */
  async deleteTransition(
    organizationId: string,
    templateId: string,
    transitionId: string
  ): Promise<void> {
    // Verify template ownership
    await this.getTemplateById(organizationId, templateId);

    // Verify transition exists
    const existing = await this.prisma.intakeFormTransition.findFirst({
      where: { id: transitionId },
      include: { fromStep: true },
    });

    if (!existing || existing.fromStep.templateId !== templateId) {
      throw new NotFoundError('Transition not found in this template');
    }

    await this.prisma.intakeFormTransition.delete({
      where: { id: transitionId },
    });
  }

  // ==================== HELPER METHODS ====================

  private mapTemplateToDto(template: any): TemplateWithRelations {
    return {
      ...template,
      config: JSON.parse(template.config),
      completionRules: JSON.parse(template.completionRules),
      conversionSettings: template.conversionSettings
        ? JSON.parse(template.conversionSettings)
        : undefined,
      steps: template.steps?.map((s: any) => this.mapStepToDto(s)) || [],
      fields: template.fields?.map((f: any) => this.mapFieldToDto(f)) || [],
    };
  }

  private mapStepToDto(step: any): StepWithFields {
    return {
      ...step,
      skipCondition: step.skipCondition
        ? JSON.parse(step.skipCondition)
        : undefined,
      completionRules: step.completionRules
        ? JSON.parse(step.completionRules)
        : undefined,
      displayStyle: step.displayStyle ? JSON.parse(step.displayStyle) : undefined,
      fields: step.fields?.map((f: any) => this.mapFieldToDto(f)) || [],
      transitions:
        step.transitions?.map((t: any) => this.mapTransitionToDto(t)) || [],
    };
  }

  private mapFieldToDto(field: any): any {
    return {
      ...field,
      validationRules: field.validationRules
        ? JSON.parse(field.validationRules)
        : undefined,
      options: field.options ? JSON.parse(field.options) : undefined,
      defaultValue: field.defaultValue
        ? JSON.parse(field.defaultValue)
        : undefined,
      showIf: field.showIf ? JSON.parse(field.showIf) : undefined,
      requireIf: field.requireIf ? JSON.parse(field.requireIf) : undefined,
      displayStyle: field.displayStyle
        ? JSON.parse(field.displayStyle)
        : undefined,
    };
  }

  private mapTransitionToDto(transition: any): any {
    return {
      ...transition,
      condition: transition.condition
        ? JSON.parse(transition.condition)
        : undefined,
      action: transition.action ? JSON.parse(transition.action) : undefined,
      requirements: transition.requirements
        ? JSON.parse(transition.requirements)
        : undefined,
    };
  }
}
