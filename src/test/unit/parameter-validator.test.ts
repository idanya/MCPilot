import { ParameterValidator, ValidationErrorCode } from '../../services/parser/parameter-validator';
import { ToolSchema } from '../../entities/mcp';

describe('ParameterValidator', () => {
  let validator: ParameterValidator;

  beforeEach(() => {
    validator = new ParameterValidator();
  });

  describe('Basic type validation', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        stringParam: { type: 'string' },
        numberParam: { type: 'number' },
        booleanParam: { type: 'boolean' },
        arrayParam: { type: 'array' },
        objectParam: { type: 'object' }
      }
    };

    it('validates string parameters', () => {
      const result = validator.validate({ stringParam: 'test' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('validates number parameters', () => {
      const result = validator.validate({ numberParam: '123' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('validates boolean parameters', () => {
      const result = validator.validate({ booleanParam: 'true' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('validates array parameters', () => {
      const result = validator.validate({ arrayParam: '[1,2,3]' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('validates object parameters', () => {
      const result = validator.validate({ objectParam: '{"key":"value"}' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('detects invalid type for number', () => {
      const result = validator.validate({ numberParam: 'not-a-number' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.INVALID_TYPE);
    });
  });

  describe('Required parameter validation', () => {
    const schema: ToolSchema = {
      type: 'object',
      required: ['requiredParam'],
      properties: {
        requiredParam: { type: 'string' },
        optionalParam: { type: 'string' }
      }
    };

    it('validates when required parameter is present', () => {
      const result = validator.validate({ requiredParam: 'test' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('fails when required parameter is missing', () => {
      const result = validator.validate({ optionalParam: 'test' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.MISSING_REQUIRED);
    });
  });

  describe('Number range validation', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        rangeParam: {
          type: 'number',
          minimum: 0,
          maximum: 100
        }
      }
    };

    it('validates number within range', () => {
      const result = validator.validate({ rangeParam: '50' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('fails for number below minimum', () => {
      const result = validator.validate({ rangeParam: '-1' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.OUT_OF_RANGE);
    });

    it('fails for number above maximum', () => {
      const result = validator.validate({ rangeParam: '101' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.OUT_OF_RANGE);
    });
  });

  describe('String pattern validation', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        emailParam: {
          type: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        }
      }
    };

    it('validates string matching pattern', () => {
      const result = validator.validate({ emailParam: 'test@example.com' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('fails for string not matching pattern', () => {
      const result = validator.validate({ emailParam: 'not-an-email' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.PATTERN_MISMATCH);
    });
  });

  describe('Enum validation', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        enumParam: {
          type: 'string',
          enum: ['option1', 'option2', 'option3']
        }
      }
    };

    it('validates value in enum', () => {
      const result = validator.validate({ enumParam: 'option1' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('fails for value not in enum', () => {
      const result = validator.validate({ enumParam: 'invalid' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.ENUM_MISMATCH);
    });
  });

  describe('Array item validation', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        arrayParam: {
          type: 'array'
        }
      },
      items: {
        type: 'number'
      }
    };

    it('validates array with valid items', () => {
      const result = validator.validate({ arrayParam: '[1,2,3]' }, schema);
      expect(result.isValid).toBe(true);
    });

    it('validates array with nested objects', () => {
      const nestedSchema: ToolSchema = {
        type: 'object',
        properties: {
          arrayParam: {
            type: 'array'
          }
        },
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' }
          }
        }
      };

      const result = validator.validate({
        arrayParam: '[{"id":1,"name":"test"}]'
      }, nestedSchema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Custom validation rules', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        customParam: { type: 'string' }
      }
    };

    it('applies custom validator', () => {
      validator.addCustomValidator((value, property) => {
        if (typeof value === 'string' && value.length < 3) {
          return {
            parameter: 'customParam',
            message: 'Value too short',
            code: ValidationErrorCode.CUSTOM_VALIDATION_FAILED
          };
        }
        return null;
      });

      const result = validator.validate({ customParam: 'ab' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.CUSTOM_VALIDATION_FAILED);
    });
  });

  describe('Type coercion', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        numberParam: { type: 'number' },
        booleanParam: { type: 'boolean' },
        arrayParam: { type: 'array' },
        objectParam: { type: 'object' }
      }
    };

    it('coerces number values', () => {
      const result = validator.coerceValues({ numberParam: '123' }, schema);
      expect(typeof result.numberParam).toBe('number');
      expect(result.numberParam).toBe(123);
    });

    it('coerces boolean values', () => {
      const result = validator.coerceValues({ booleanParam: 'true' }, schema);
      expect(typeof result.booleanParam).toBe('boolean');
      expect(result.booleanParam).toBe(true);
    });

    it('coerces array values', () => {
      const result = validator.coerceValues({ arrayParam: '[1,2,3]' }, schema);
      expect(Array.isArray(result.arrayParam)).toBe(true);
      expect(result.arrayParam).toEqual([1, 2, 3]);
    });

    it('coerces object values', () => {
      const result = validator.coerceValues(
        { objectParam: '{"key":"value"}' },
        schema
      );
      expect(typeof result.objectParam).toBe('object');
      expect(result.objectParam).toEqual({ key: 'value' });
    });

    it('coerces nested structures', () => {
      const nestedSchema: ToolSchema = {
        type: 'object',
        properties: {
          arrayParam: { type: 'array' }
        },
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            active: { type: 'boolean' }
          }
        }
      };

      const result = validator.coerceValues({
        arrayParam: '[{"id":"123","active":"true"}]'
      }, nestedSchema);

      expect(Array.isArray(result.arrayParam)).toBe(true);
      expect(typeof result.arrayParam[0].id).toBe('number');
      expect(typeof result.arrayParam[0].active).toBe('boolean');
    });
  });

  describe('Error cases', () => {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        param: { type: 'string' }
      },
      additionalProperties: false
    };

    it('handles unknown parameters', () => {
      const result = validator.validate({ unknown: 'value' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.UNKNOWN_PARAMETER);
    });

    it('handles invalid JSON for array/object', () => {
      const result = validator.validate(
        { param: 'invalid-json' },
        {
          type: 'object',
          properties: {
            param: { type: 'object' }
          }
        }
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.INVALID_TYPE);
    });
  });
});