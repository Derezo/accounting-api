/**
 * Environment-specific database configurations
 */

export interface EnvironmentConfig {
  name: string;
  database: {
    url: string;
    shadowUrl?: string;
    maxConnections: number;
    timeout: number;
    logging: boolean;
    ssl?: boolean;
  };
  seeding: {
    enabled: boolean;
    includeDemo: boolean;
    includeSensitive: boolean;
    organizationCount: number;
    customerCount: number;
    cleanBeforeSeed: boolean;
  };
  migrations: {
    autoApply: boolean;
    backupBeforeMigration: boolean;
    rollbackOnFailure: boolean;
  };
  security: {
    encryptionEnabled: boolean;
    anonymizeData: boolean;
    auditingEnabled: boolean;
  };
  performance: {
    enableQueryLogging: boolean;
    slowQueryThreshold: number;
    connectionPooling: boolean;
  };
  monitoring: {
    healthChecks: boolean;
    metrics: boolean;
    alerting: boolean;
  };
}

export const environments: Record<string, EnvironmentConfig> = {
  development: {
    name: 'development',
    database: {
      url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
      shadowUrl: process.env.SHADOW_DATABASE_URL,
      maxConnections: 10,
      timeout: 30000,
      logging: true,
      ssl: false,
    },
    seeding: {
      enabled: true,
      includeDemo: true,
      includeSensitive: false,
      organizationCount: 4,
      customerCount: 20,
      cleanBeforeSeed: true,
    },
    migrations: {
      autoApply: false,
      backupBeforeMigration: true,
      rollbackOnFailure: true,
    },
    security: {
      encryptionEnabled: true,
      anonymizeData: false,
      auditingEnabled: true,
    },
    performance: {
      enableQueryLogging: true,
      slowQueryThreshold: 1000,
      connectionPooling: false,
    },
    monitoring: {
      healthChecks: true,
      metrics: true,
      alerting: false,
    },
  },

  testing: {
    name: 'testing',
    database: {
      url: process.env.TEST_DATABASE_URL || 'file:./prisma/test.db',
      shadowUrl: process.env.TEST_SHADOW_DATABASE_URL,
      maxConnections: 5,
      timeout: 10000,
      logging: false,
      ssl: false,
    },
    seeding: {
      enabled: true,
      includeDemo: false,
      includeSensitive: false,
      organizationCount: 1,
      customerCount: 5,
      cleanBeforeSeed: true,
    },
    migrations: {
      autoApply: true,
      backupBeforeMigration: false,
      rollbackOnFailure: true,
    },
    security: {
      encryptionEnabled: true,
      anonymizeData: true,
      auditingEnabled: false,
    },
    performance: {
      enableQueryLogging: false,
      slowQueryThreshold: 5000,
      connectionPooling: false,
    },
    monitoring: {
      healthChecks: true,
      metrics: false,
      alerting: false,
    },
  },

  staging: {
    name: 'staging',
    database: {
      url: process.env.DATABASE_URL || '',
      shadowUrl: process.env.SHADOW_DATABASE_URL,
      maxConnections: 25,
      timeout: 60000,
      logging: false,
      ssl: true,
    },
    seeding: {
      enabled: true,
      includeDemo: true,
      includeSensitive: false,
      organizationCount: 1,
      customerCount: 10,
      cleanBeforeSeed: false,
    },
    migrations: {
      autoApply: false,
      backupBeforeMigration: true,
      rollbackOnFailure: true,
    },
    security: {
      encryptionEnabled: true,
      anonymizeData: true,
      auditingEnabled: true,
    },
    performance: {
      enableQueryLogging: false,
      slowQueryThreshold: 2000,
      connectionPooling: true,
    },
    monitoring: {
      healthChecks: true,
      metrics: true,
      alerting: true,
    },
  },

  production: {
    name: 'production',
    database: {
      url: process.env.DATABASE_URL || '',
      shadowUrl: process.env.SHADOW_DATABASE_URL,
      maxConnections: 50,
      timeout: 120000,
      logging: false,
      ssl: true,
    },
    seeding: {
      enabled: false,
      includeDemo: false,
      includeSensitive: false,
      organizationCount: 0,
      customerCount: 0,
      cleanBeforeSeed: false,
    },
    migrations: {
      autoApply: false,
      backupBeforeMigration: true,
      rollbackOnFailure: false,
    },
    security: {
      encryptionEnabled: true,
      anonymizeData: false,
      auditingEnabled: true,
    },
    performance: {
      enableQueryLogging: false,
      slowQueryThreshold: 5000,
      connectionPooling: true,
    },
    monitoring: {
      healthChecks: true,
      metrics: true,
      alerting: true,
    },
  },
};

/**
 * Get configuration for specified environment
 */
export function getEnvironmentConfig(env?: string): EnvironmentConfig {
  const environment = env || process.env.NODE_ENV || 'development';

  if (!(environment in environments)) {
    throw new Error(`Unknown environment: ${environment}`);
  }

  return environments[environment];
}

/**
 * Validate environment configuration
 */
export function validateEnvironmentConfig(config: EnvironmentConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate database URL
  if (!config.database.url) {
    errors.push('Database URL is required');
  }

  // Validate production settings
  if (config.name === 'production') {
    if (config.seeding.enabled) {
      errors.push('Seeding should not be enabled in production');
    }
    if (config.database.logging) {
      errors.push('Database logging should be disabled in production');
    }
    if (!config.database.ssl) {
      errors.push('SSL should be enabled in production');
    }
  }

  // Validate staging settings
  if (config.name === 'staging') {
    if (config.seeding.includeSensitive) {
      errors.push('Sensitive data should not be included in staging');
    }
    if (!config.security.anonymizeData) {
      errors.push('Data anonymization should be enabled in staging');
    }
  }

  // Validate connection limits
  if (config.database.maxConnections < 1) {
    errors.push('Maximum connections must be at least 1');
  }

  if (config.database.timeout < 1000) {
    errors.push('Database timeout should be at least 1000ms');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get database URL with environment-specific overrides
 */
export function getDatabaseUrl(env?: string): string {
  const config = getEnvironmentConfig(env);
  return config.database.url;
}

/**
 * Check if environment allows dangerous operations
 */
export function allowsDangerousOperations(env?: string): boolean {
  const environment = env || process.env.NODE_ENV || 'development';
  return ['development', 'testing'].includes(environment);
}

/**
 * Get environment-specific Prisma configuration
 */
export function getPrismaConfig(env?: string) {
  const config = getEnvironmentConfig(env);

  return {
    datasources: {
      db: {
        url: config.database.url,
        shadowDatabaseUrl: config.database.shadowUrl,
      },
    },
    log: config.database.logging ? ['query', 'info', 'warn', 'error'] : ['error'],
    errorFormat: 'pretty' as const,
  };
}

export default {
  environments,
  getEnvironmentConfig,
  validateEnvironmentConfig,
  getDatabaseUrl,
  allowsDangerousOperations,
  getPrismaConfig,
};