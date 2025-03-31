/**
 * Parameter validator for tool requests
 */

import { ToolSchema, ToolProperty, ToolSchemaItems } from "../mcp/types.ts";

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  parameter: string;
  message: string;
  code: ValidationErrorCode;
}

export enum ValidationErrorCode {
  MISSING_REQUIRED = "MISSING_REQUIRED",
  INVALID_TYPE = "INVALID_TYPE",
  OUT_OF_RANGE = "OUT_OF_RANGE",
  PATTERN_MISMATCH = "PATTERN_MISMATCH",
  UNKNOWN_PARAMETER = "UNKNOWN_PARAMETER",
  ENUM_MISMATCH = "ENUM_MISMATCH",
  INVALID_ARRAY_ITEMS = "INVALID_ARRAY_ITEMS",
  CUSTOM_VALIDATION_FAILED = "CUSTOM_VALIDATION_FAILED",
}

type CustomValidator = (
  value: any,
  schema: ToolProperty,
) => ValidationError | null;

export class ParameterValidator {
  private customValidators: CustomValidator[] = [];

  /**
   * Add a custom validator function
   */
  public addCustomValidator(validator: CustomValidator): void {
    this.customValidators.push(validator);
  }

  /**
   * Validate parameters against tool schema
   */
  public validate(
    parameters: Record<string, string>,
    schema: ToolSchema,
  ): ValidationResult {
    // Convert XML parameters to proper types based on schema
    const errors: ValidationError[] = [];

    // Check for required parameters
    this.validateRequired(parameters, schema, errors);

    // Validate provided parameters
    this.validateParameters(parameters, schema, errors);

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate required parameters are present
   */
  private validateRequired(
    parameters: Record<string, string>,
    schema: ToolSchema,
    errors: ValidationError[],
  ): void {
    if (!schema.required) return;

    for (const required of schema.required) {
      if (!parameters[required]) {
        errors.push({
          parameter: required,
          message: `Missing required parameter: ${required}`,
          code: ValidationErrorCode.MISSING_REQUIRED,
        });
      }
    }
  }

  /**
   * Validate parameter values against schema
   */
  private validateParameters(
    parameters: Record<string, string>,
    schema: ToolSchema,
    errors: ValidationError[],
  ): void {
    for (const [name, value] of Object.entries(parameters)) {
      const property = schema.properties?.[name];

      // Check if parameter is defined in schema
      if (!property && !schema.additionalProperties) {
        errors.push({
          parameter: name,
          message: `Unknown parameter: ${name}`,
          code: ValidationErrorCode.UNKNOWN_PARAMETER,
        });
        continue;
      }

      if (!property) continue; // Skip validation for additional properties

      this.validateValue(name, value, property, schema, errors);
    }
  }

  /**
   * Validate a single value against its schema property
   */
  private validateValue(
    name: string,
    value: string,
    property: ToolProperty,
    schema: ToolSchema,
    errors: ValidationError[],
  ): void {
    // Basic type validation
    const typeValid = this.validateType(value, property.type);
    if (!typeValid) {
      errors.push({
        parameter: name,
        message: `Invalid type for ${name}: expected ${property.type}`,
        code: ValidationErrorCode.INVALID_TYPE,
      });
      return;
    }

    // Validate number constraints
    if (property.type === "number" || property.type === "integer") {
      const numValue = Number(value);
      if (property.minimum !== undefined && numValue < property.minimum) {
        errors.push({
          parameter: name,
          message: `Value ${value} is below minimum ${property.minimum}`,
          code: ValidationErrorCode.OUT_OF_RANGE,
        });
      }
      if (property.maximum !== undefined && numValue > property.maximum) {
        errors.push({
          parameter: name,
          message: `Value ${value} exceeds maximum ${property.maximum}`,
          code: ValidationErrorCode.OUT_OF_RANGE,
        });
      }
    }

    // Validate string pattern
    if (property.type === "string" && property.pattern) {
      const regex = new RegExp(property.pattern);
      if (!regex.test(value)) {
        errors.push({
          parameter: name,
          message: `Value does not match pattern: ${property.pattern}`,
          code: ValidationErrorCode.PATTERN_MISMATCH,
        });
      }
    }

    // Validate enum values
    if (property.enum) {
      if (!property.enum.includes(value)) {
        errors.push({
          parameter: name,
          message: `Value must be one of: ${property.enum.join(", ")}`,
          code: ValidationErrorCode.ENUM_MISMATCH,
        });
      }
    }

    // Validate array items
    if (property.type === "array" && schema.items && Array.isArray(value)) {
      this.validateArrayItems(name, value, schema.items, errors);
    }

    // Run custom validators
    for (const validator of this.customValidators) {
      const error = validator(value, property);
      if (error) {
        errors.push({
          ...error,
          parameter: name,
        });
      }
    }
  }

  /**
   * Validate array items against schema
   */
  private validateArrayItems(
    paramName: string,
    items: any[],
    schema: ToolSchemaItems,
    errors: ValidationError[],
  ): void {
    items.forEach((item, index) => {
      if (typeof item !== schema.type) {
        errors.push({
          parameter: `${paramName}[${index}]`,
          message: `Invalid type for array item: expected ${schema.type}`,
          code: ValidationErrorCode.INVALID_ARRAY_ITEMS,
        });
        return;
      }

      if (schema.properties && typeof item === "object") {
        // Validate nested object properties
        Object.entries(schema.properties).forEach(([propName, propSchema]) => {
          if (item[propName] === undefined) return;
          const arraySchema: ToolSchema = {
            type: schema.type,
            properties: schema.properties,
          };
          this.validateValue(
            `${paramName}[${index}].${propName}`,
            String(item[propName]),
            propSchema,
            arraySchema,
            errors,
          );
        });
      }
    });
  }

  /**
   * Validate parameter type
   */
  private validateType(value: any, type: string): boolean {
    // If value is already parsed (for arrays/objects), validate directly
    if (typeof value !== "string") {
      switch (type) {
        case "array":
          return Array.isArray(value);
        case "object":
          return typeof value === "object" && value !== null;
        case "string":
          return typeof value === "string";
        case "number":
        case "integer":
          return typeof value === "number" || !isNaN(Number(value));
        case "boolean":
          return (
            typeof value === "boolean" || value === "true" || value === "false"
          );
        default:
          return false;
      }
    }

    // For string values
    switch (type) {
      case "string":
        return true;
      case "number":
        return !isNaN(Number(value));
      case "boolean":
        return value === "true" || value === "false";
      case "array":
        return value.trim().startsWith("[") && this.isValidJson(value);
      case "object":
        return value.trim().startsWith("{") && this.isValidJson(value);
      default:
        return false;
    }
  }

  private isValidJson(value: string): boolean {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse string value to proper type
   */
  private parseValue(value: string, type: string): any {
    switch (type) {
      case "number":
        return Number(value);
      case "boolean":
        return value === "true";
      case "array":
      case "object":
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Convert string values to proper types
   */
  public coerceValues(
    parameters: Record<string, string>,
    schema: ToolSchema,
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [name, value] of Object.entries(parameters)) {
      const property = schema.properties?.[name];
      if (!property) {
        result[name] = value;
        continue;
      }

      result[name] = this.coerceValue(value, property, schema);
    }

    return result;
  }

  /**
   * Coerce a single value based on schema
   */
  private coerceValue(
    value: string,
    property: ToolProperty,
    schema?: ToolSchema,
  ): any {
    switch (property.type) {
      case "number":
        return Number(value);
      case "boolean":
        return value === "true";
      case "array":
        try {
          const array = JSON.parse(value);
          if (!Array.isArray(array)) return value;

          // Coerce array items if schema exists
          const itemSchema = schema?.items;
          if (!itemSchema) {
            return array;
          }

          return array.map((item) => {
            if (itemSchema.type === "object" && itemSchema.properties) {
              // Coerce nested object properties
              const result: Record<string, any> = {};
              for (const [key, val] of Object.entries(item)) {
                const propSchema = itemSchema.properties[key];
                if (propSchema) {
                  result[key] = this.coerceValue(String(val), propSchema);
                } else {
                  result[key] = val;
                }
              }
              return result;
            }
            return this.coerceValue(String(item), { type: itemSchema.type });
          });
          return array;
        } catch {
          return value;
        }
      case "object":
        try {
          const obj = JSON.parse(value);
          if (typeof obj !== "object" || obj === null) return value;

          // Coerce object properties if schema exists
          if (schema?.properties) {
            const result: Record<string, any> = {};
            for (const [key, val] of Object.entries(obj)) {
              const propSchema = schema.properties[key];
              if (propSchema) {
                result[key] = this.coerceValue(String(val), propSchema);
              } else {
                result[key] = val;
              }
            }
            return result;
          }
          return obj;
        } catch {
          return value;
        }
      default:
        return value;
    }
  }
}
