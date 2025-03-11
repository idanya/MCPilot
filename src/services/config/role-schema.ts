/**
 * Role configuration schema definition using zod
 */

import { z } from "zod";

// Role constraints schema
const roleConstraintsSchema = z.object({
  allowedCommands: z.array(z.string()).optional(),
  disallowedPaths: z.array(z.string()).optional(),
  maxContextSize: z.number().positive().optional(),
});

// Individual role schema
const roleSchema = z.object({
  definition: z.string().min(1),
  instructions: z.string().min(1),
  constraints: roleConstraintsSchema.optional(),
});

// Main roles configuration schema
export const rolesConfigSchema = z
  .object({
    roles: z.record(roleSchema),
    defaultRole: z.string().optional(),
  })
  .refine(
    (config) => {
      // If defaultRole is specified, ensure it exists in roles map
      if (config.defaultRole) {
        return config.roles[config.defaultRole] !== undefined;
      }
      return true;
    },
    {
      message: "defaultRole must reference a role defined in the roles map",
      path: ["defaultRole"],
    },
  );

// Export schema type
export type RolesConfigSchema = z.infer<typeof rolesConfigSchema>;

// Roles configuration validation function
export const validateRolesConfig = (config: unknown) => {
  return rolesConfigSchema.safeParse(config);
};
