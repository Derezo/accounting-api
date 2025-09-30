import * as Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface EmailTemplateData {
  // Organization branding
  organizationName: string;
  organizationLogo?: string;
  organizationAddress?: string;
  organizationPhone?: string;
  organizationEmail?: string;

  // Common
  subject: string;
  currentYear: number;

  // Dynamic content
  [key: string]: any;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

class EmailTemplateService {
  private templatesPath: string;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.templatesPath = path.join(__dirname, '../templates/email');
  }

  /**
   * Initialize the template service
   * Load and compile base layout and partials
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Register helpers
      this.registerHelpers();

      // Load and register partials
      await this.registerPartials();

      // Precompile common layout
      const layoutPath = path.join(this.templatesPath, 'layouts/base.hbs');
      const layoutContent = await fs.readFile(layoutPath, 'utf-8');
      this.compiledTemplates.set('layout:base', Handlebars.compile(layoutContent));

      this.initialized = true;
      logger.info('Email template service initialized');
    } catch (error) {
      logger.error('Failed to initialize email template service', error);
      throw new Error('Email template service initialization failed');
    }
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date | string, format: string = 'long') => {
      const d = typeof date === 'string' ? new Date(date) : date;

      if (format === 'short') {
        return d.toLocaleDateString();
      } else if (format === 'time') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return d.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    });

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount: number | string, currency: string = 'CAD') => {
      const num = typeof amount === 'string' ? parseFloat(amount) : amount;
      return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: currency
      }).format(num);
    });

    // Conditional helper
    Handlebars.registerHelper('if_eq', function(this: any, a: any, b: any, options: any) {
      return a === b ? options.fn(this) : options.inverse(this);
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    });
  }

  /**
   * Register all partials from partials directory
   */
  private async registerPartials(): Promise<void> {
    const partialsPath = path.join(this.templatesPath, 'partials');

    try {
      const files = await fs.readdir(partialsPath);

      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const partialName = file.replace('.hbs', '');
          const partialPath = path.join(partialsPath, file);
          const content = await fs.readFile(partialPath, 'utf-8');
          Handlebars.registerPartial(partialName, content);
          logger.info(`Registered partial: ${partialName}`);
        }
      }
    } catch (error) {
      logger.error('Failed to register partials', error);
      throw error;
    }
  }

  /**
   * Render an email template
   */
  async render(templateName: string, data: Partial<EmailTemplateData>): Promise<RenderedEmail> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Add default data
      const templateData: EmailTemplateData = {
        organizationName: data.organizationName || 'Lifestream Dynamics',
        organizationEmail: data.organizationEmail || process.env.EMAIL_FROM || 'noreply@lifestreamdynamics.com',
        organizationPhone: data.organizationPhone,
        organizationAddress: data.organizationAddress,
        organizationLogo: data.organizationLogo,
        subject: data.subject || 'Notification',
        currentYear: new Date().getFullYear(),
        ...data
      };

      // Load and compile template if not cached
      const cacheKey = `template:${templateName}`;
      let bodyTemplate = this.compiledTemplates.get(cacheKey);

      if (!bodyTemplate) {
        const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        bodyTemplate = Handlebars.compile(templateContent);
        this.compiledTemplates.set(cacheKey, bodyTemplate);
      }

      // Render body
      const body = bodyTemplate(templateData);

      // Render with layout
      const layout = this.compiledTemplates.get('layout:base')!;
      const html = layout({
        ...templateData,
        body
      });

      // Generate plain text version
      const text = this.htmlToText(html);

      return {
        subject: templateData.subject,
        html,
        text
      };
    } catch (error) {
      logger.error(`Failed to render template: ${templateName}`, error);
      throw new Error(`Email template rendering failed: ${templateName}`);
    }
  }

  /**
   * Convert HTML to plain text for email fallback
   */
  private htmlToText(html: string): string {
    return html
      // Remove style tags
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove script tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Replace line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      // Remove all HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      // Remove multiple newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Trim
      .trim();
  }

  /**
   * Clear template cache (useful for development)
   */
  clearCache(): void {
    this.compiledTemplates.clear();
    this.initialized = false;
    logger.info('Email template cache cleared');
  }
}

export const emailTemplateService = new EmailTemplateService();